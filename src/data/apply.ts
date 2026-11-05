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

/**
 * The ChangeSet that puts back everything `changes` would alter, computed
 * from the state before it is applied. Powers "Undo" on every action.
 */
export function inverseOf(state: AppState, changes: ChangeSet): ChangeSet {
  const inv: ChangeSet = { put: [], remove: [], config: [] };
  const seen = new Set<string>();
  const keyOf = (c: CollectionName, x: { id?: string; date?: string }) => (c === "sales" ? x.date : x.id);
  const restore = (collection: CollectionName, id: string) => {
    const k = `${collection}/${id}`;
    if (seen.has(k)) return;
    seen.add(k);
    const before = (state[collection] as { id?: string; date?: string }[]).find((x) => keyOf(collection, x) === id);
    if (before) inv.put.push({ collection, id, data: before });
    else inv.remove.push({ collection, id });
  };
  for (const p of changes.put) restore(p.collection, p.id);
  for (const r of changes.remove) restore(r.collection, r.id);
  for (const c of changes.config) {
    if (seen.has(`config/${c.doc}`)) continue;
    seen.add(`config/${c.doc}`);
    inv.config.push({ doc: c.doc, data: c.doc === "settings" ? state.settings : state.feed });
  }
  return inv;
}
