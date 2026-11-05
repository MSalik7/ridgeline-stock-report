import type { AppState, ChangeSet, CollectionName } from "@/domain/types";

/** Applies a ChangeSet to in-memory state, returning new state (inputs untouched). */
export function applyChanges(state: AppState, changes: ChangeSet): AppState {
  const next: AppState = { ...state };
  const touched = new Set<CollectionName>();
  const ensure = (c: CollectionName) => {
    if (!touched.has(c)) {
      (next as unknown as Record<string, unknown[]>)[c] = [...(state[c] as unknown[])];
      touched.add(c);
    }
    return (next as unknown as Record<string, { id?: string; date?: string }[]>)[c];
  };
  const keyOf = (c: CollectionName, x: { id?: string; date?: string }) => (c === "sales" ? x.date : x.id);

  for (const r of changes.remove) {
    const list = ensure(r.collection);
    const i = list.findIndex((x) => keyOf(r.collection, x) === r.id);
    if (i >= 0) list.splice(i, 1);
  }
  for (const p of changes.put) {
    const list = ensure(p.collection);
    const i = list.findIndex((x) => keyOf(p.collection, x) === p.id);
    if (i >= 0) list[i] = p.data as never;
    else list.push(p.data as never);
  }
  for (const c of changes.config) {
    if (c.doc === "settings") next.settings = c.data as AppState["settings"];
    else next.feed = c.data as AppState["feed"];
  }
  return next;
}
