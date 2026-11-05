/**
 * Where the data lives.
 *
 * Shared mode: the artifact's database, so staff and suppliers see the same
 * orders live. Used when this viewer may write it.
 *
 * Sandbox mode: a private copy in this browser. Used when the viewer can only
 * read the shared data (they get a copy of it), when shared data isn't
 * available in this view, or when running the app outside Claude. Every
 * feature works the same; changes just stay on this device.
 *
 * Both modes take the same ChangeSets from src/domain/mutations.ts.
 */
import { useSyncExternalStore } from "react";
import { applyChanges } from "@/data/apply";
import { buildDemoState } from "@/data/demo";
import type { AppState, ChangeSet, CollectionName } from "@/domain/types";

// ---- the slice of the Claude artifact runtime this app uses

interface DbSnap {
  exists: boolean;
  id: string;
  data(): Record<string, unknown> | undefined;
  metadata: { fromCache: boolean };
}
interface DbQuerySnap {
  docs: DbSnap[];
  metadata: { fromCache: boolean };
}
interface DbDocRef {
  set(d: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (s: DbSnap) => void, err?: (e: { code: string; message: string }) => void): () => void;
}
interface DbCollRef {
  doc(id: string): DbDocRef;
  onSnapshot(next: (s: DbQuerySnap) => void, err?: (e: { code: string; message: string }) => void): () => void;
}
interface Db {
  doc(path: string): DbDocRef;
  collection(path: string): DbCollRef;
}
export interface UserApi {
  id(): Promise<string | null>;
  isOwner(): Promise<boolean>;
  can(name: string): Promise<boolean | null>;
  profiles(ids: string[]): Promise<Record<string, { name: string }>>;
}
interface ClaudeRuntime {
  use(name: "db"): Promise<Db | null>;
  use(name: "user"): Promise<UserApi | null>;
}

function runtime(): ClaudeRuntime | null {
  const c = (window as unknown as { claude?: ClaudeRuntime }).claude;
  return c && typeof c.use === "function" ? c : null;
}

// ---- store state

export type Mode = "loading" | "shared" | "sandbox" | "empty";

export interface StoreState {
  mode: Mode;
  data: AppState | null;
  /** Why the app is in sandbox mode, in the viewer's terms. */
  sandboxReason: string | null;
  viewerId: string | null;
  isOwner: boolean;
  /** Shared data might be out of date: the store hasn't answered in 10 s. */
  slow: boolean;
  user: UserApi | null;
}

const COLLECTIONS: CollectionName[] = ["products", "suppliers", "orders", "arrivals", "stockChanges", "sales", "outbox"];
const SANDBOX_KEY = "ridgeline-stock:sandbox:v1";

let current: StoreState = {
  mode: "loading",
  data: null,
  sandboxReason: null,
  viewerId: null,
  isOwner: false,
  slow: false,
  user: null,
};
const listeners = new Set<() => void>();
function set(patch: Partial<StoreState>) {
  current = { ...current, ...patch };
  listeners.forEach((l) => l());
}

let db: Db | null = null;
let started = false;

export function useStore(): StoreState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

// ---- sandbox

function readSandbox(): AppState | null {
  try {
    const raw = localStorage.getItem(SANDBOX_KEY);
    return raw ? (JSON.parse(raw) as AppState) : null;
  } catch {
    return null;
  }
}
function writeSandbox(s: AppState) {
  try {
    localStorage.setItem(SANDBOX_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked (private window, preview): the sandbox still works for this visit.
  }
}

function enterSandbox(reason: string, from: AppState | null) {
  const data = readSandbox() ?? from ?? buildDemoState(new Date());
  writeSandbox(data);
  set({ mode: "sandbox", data, sandboxReason: reason });
}

/** Throws away the private copy and starts over from the shared data or fresh demo data. */
export function resetSandbox(from: "demo" | "shared" = "demo") {
  try {
    localStorage.removeItem(SANDBOX_KEY);
  } catch {
    /* ignore */
  }
  const data = from === "shared" && sharedSnapshot ? sharedSnapshot : buildDemoState(new Date());
  writeSandbox(data);
  set({ data });
}

// ---- shared

let sharedSnapshot: AppState | null = null;

function clean(x: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(x)) as Record<string, unknown>;
}

function subscribeShared(onReady: (state: AppState | null) => void) {
  const parts: Partial<Record<CollectionName | "settings" | "feed", unknown>> = {};
  const confirmed = new Set<string>();
  const needed = [...COLLECTIONS, "settings", "feed"];
  let ready = false;

  const timer = window.setTimeout(() => set({ slow: true }), 10_000);

  const publish = () => {
    if (!needed.every((k) => k in parts)) return;
    if (!parts.settings) {
      if (!ready && needed.every((k) => confirmed.has(k))) {
        ready = true;
        onReady(null);
      }
      return;
    }
    const state = {
      ...(Object.fromEntries(COLLECTIONS.map((c) => [c, parts[c]])) as Pick<AppState, CollectionName>),
      settings: parts.settings as AppState["settings"],
      feed: (parts.feed as AppState["feed"]) ?? { salesSyncedAt: null, stockSyncedAt: null },
    } as AppState;
    sharedSnapshot = state;
    if (!ready) {
      ready = true;
      onReady(state);
    } else if (current.mode === "shared") {
      set({ data: state });
    }
  };

  for (const c of COLLECTIONS) {
    db!.collection(c).onSnapshot(
      (snap) => {
        parts[c] = snap.docs.filter((d) => d.exists).map((d) => d.data());
        if (!snap.metadata.fromCache) confirmed.add(c);
        if (confirmed.size === needed.length) {
          window.clearTimeout(timer);
          set({ slow: false });
        }
        publish();
      },
      () => {
        window.clearTimeout(timer);
        if (current.mode !== "sandbox") enterSandbox("Shared data stopped responding, so you're working in a private copy.", sharedSnapshot);
      },
    );
  }
  for (const k of ["settings", "feed"] as const) {
    db!.doc(`config/${k}`).onSnapshot(
      (snap) => {
        parts[k] = snap.exists ? snap.data() : null;
        if (!snap.metadata.fromCache) confirmed.add(k);
        if (confirmed.size === needed.length) {
          window.clearTimeout(timer);
          set({ slow: false });
        }
        publish();
      },
      () => {
        window.clearTimeout(timer);
        if (current.mode !== "sandbox") enterSandbox("Shared data stopped responding, so you're working in a private copy.", sharedSnapshot);
      },
    );
  }
}

/** Starts once: decides the mode and loads data. */
export async function startStore() {
  if (started) return;
  started = true;
  const rt = runtime();
  if (!rt) {
    enterSandbox("This copy runs outside Claude, so changes are saved in this browser only.", null);
    return;
  }
  const [dbApi, user] = await Promise.all([rt.use("db"), rt.use("user")]);
  const [viewerId, isOwner, canWrite] = user
    ? await Promise.all([user.id(), user.isOwner(), user.can("data.write")])
    : [null, false, null];
  set({ user, viewerId, isOwner });

  if (!dbApi) {
    enterSandbox("Shared data isn't available in this view (for example when signed out), so you're working in a private copy.", null);
    return;
  }
  db = dbApi;
  subscribeShared((state) => {
    if (canWrite === false) {
      enterSandbox("You can view the shared data but not change it, so you're working in a private copy of it.", state);
      return;
    }
    if (!state) {
      set({ mode: "empty" });
      return;
    }
    set({ mode: "shared", data: state });
  });
}

// ---- writes

const queue = new Map<string, Promise<void>>();

/** One write at a time per document. */
function enqueue(key: string, op: () => Promise<void>) {
  const prev = queue.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(op);
  queue.set(key, next);
  return next;
}

export class ReadOnlyError extends Error {}

/** Applies a ChangeSet to whichever store is active. */
export async function commit(changes: ChangeSet): Promise<void> {
  if (current.mode === "sandbox" || current.mode === "empty" || current.mode === "loading") {
    if (!current.data) return;
    const data = applyChanges(current.data, changes);
    writeSandbox(data);
    set({ data });
    return;
  }
  if (!db) return;
  // Show the change straight away; the live listeners confirm it.
  set({ data: applyChanges(current.data!, changes) });
  const ops: Promise<void>[] = [];
  for (const r of changes.remove) {
    ops.push(enqueue(`${r.collection}/${r.id}`, () => db!.collection(r.collection).doc(r.id).delete()));
  }
  for (const p of changes.put) {
    ops.push(enqueue(`${p.collection}/${p.id}`, () => db!.collection(p.collection).doc(p.id).set(clean(p.data))));
  }
  for (const c of changes.config) {
    ops.push(enqueue(`config/${c.doc}`, () => db!.doc(`config/${c.doc}`).set(clean(c.data))));
  }
  const results = await Promise.allSettled(ops);
  const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
  if (failed) {
    const code = (failed.reason as { code?: string })?.code;
    if (sharedSnapshot) set({ data: sharedSnapshot });
    if (code === "invalid_argument") {
      throw new ReadOnlyError("You can't change the shared data. Switch to a private copy to try things out.");
    }
    throw new Error((failed.reason as { message?: string })?.message ?? "Saving failed. Try again.");
  }
}

/** Writes the demo business to shared storage (owner/editor only), replacing what's there. */
export async function loadDemoIntoShared(): Promise<void> {
  if (!db) throw new Error("Shared data isn't available here.");
  const demo = buildDemoState(new Date());
  const prev = sharedSnapshot;
  const changes: ChangeSet = { put: [], remove: [], config: [] };
  if (prev) {
    for (const c of COLLECTIONS) {
      const keep = new Set((demo[c] as { id?: string; date?: string }[]).map((x) => (c === "sales" ? x.date : x.id)));
      for (const x of prev[c] as { id?: string; date?: string }[]) {
        const id = (c === "sales" ? x.date : x.id)!;
        if (!keep.has(id)) changes.remove.push({ collection: c, id });
      }
    }
  }
  for (const c of COLLECTIONS) {
    for (const x of demo[c] as { id?: string; date?: string }[]) {
      changes.put.push({ collection: c, id: (c === "sales" ? x.date : x.id)!, data: x });
    }
  }
  changes.config.push({ doc: "feed", data: demo.feed }, { doc: "settings", data: demo.settings });

  // Small batches keep under the per-viewer write rate.
  const all = [
    ...changes.remove.map((r) => () => db!.collection(r.collection).doc(r.id).delete()),
    ...changes.put.map((p) => () => db!.collection(p.collection).doc(p.id).set(clean(p.data))),
    ...changes.config.map((c) => () => db!.doc(`config/${c.doc}`).set(clean(c.data))),
  ];
  for (let i = 0; i < all.length; i += 8) {
    await Promise.all(all.slice(i, i + 8).map((f) => f()));
  }
  if (current.mode === "empty") set({ mode: "shared", data: demo });
}

/** Leaves shared mode for a private copy (keeps shared data untouched). */
export function switchToSandbox() {
  enterSandbox("You chose to work in a private copy. Shared data is untouched.", sharedSnapshot);
}

/** Back to shared data, if this viewer can use it. */
export function switchToShared() {
  if (!db || !sharedSnapshot) return;
  set({ mode: "shared", data: sharedSnapshot, sandboxReason: null });
}

export function hasShared() {
  return !!db && !!sharedSnapshot;
}
