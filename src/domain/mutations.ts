/**
 * Every user action, as a pure function from current state to a ChangeSet.
 * Nothing here touches storage, so the same rules run against shared
 * storage, the local sandbox and the tests.
 */
import {
  allocatedUnits,
  autoMatch,
  normalizeAllocations,
  openCapacities,
  validateAllocations,
} from "./arrivals";
import { isStoreDate, storeDateOf } from "./dates";
import { arrivalsByOrder, orderProgress, orderStatus, CHASE_LABEL } from "./orders";
import type {
  Actor,
  Allocation,
  AppState,
  Arrival,
  ChangeSet,
  ChaseKind,
  CollectionName,
  HistoryEntry,
  OutboxMessage,
  Product,
  Settings,
  StockChange,
  StockChangeKind,
  StoreDate,
  Supplier,
  SupplierOrder,
  Tracking,
} from "./types";

export class ActionError extends Error {}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function empty(): ChangeSet {
  return { put: [], remove: [], config: [] };
}

function put(collection: CollectionName, id: string, data: unknown): ChangeSet {
  return { put: [{ collection, id, data }], remove: [], config: [] };
}

export function merge(...sets: ChangeSet[]): ChangeSet {
  return {
    put: sets.flatMap((s) => s.put),
    remove: sets.flatMap((s) => s.remove),
    config: sets.flatMap((s) => s.config),
  };
}

function entry(actor: Actor, now: Date, action: string, detail?: string): HistoryEntry {
  return detail ? { at: now.toISOString(), actor, action, detail } : { at: now.toISOString(), actor, action };
}

function withHistory(order: SupplierOrder, h: HistoryEntry, patch: Partial<SupplierOrder> = {}): SupplierOrder {
  return { ...order, ...patch, history: [...order.history, h] };
}

function findOrder(state: AppState, id: string) {
  const o = state.orders.find((x) => x.id === id);
  if (!o) throw new ActionError("That order no longer exists.");
  return o;
}

function progressOf(state: AppState, order: SupplierOrder) {
  const p = orderProgress(order, arrivalsByOrder(state.arrivals).get(order.id));
  return { p, status: orderStatus(order, p) };
}

/** Ceiling on one order, arrival or stock change: far above any real one, low enough that a slipped key can't wreck the totals. */
const MAX_UNITS = 1_000_000;

function wholePositive(n: number, what: string) {
  if (!Number.isInteger(n) || n <= 0) throw new ActionError(`${what} must be a whole number above 0.`);
  if (n > MAX_UNITS) throw new ActionError(`${what} can't be more than 1,000,000. Check for an extra digit.`);
}

/** A day someone typed for something that already happened: real, not ahead of today, and not a year typo like 0202. */
function pastDay(day: string, what: string, now: Date) {
  if (!isStoreDate(day)) throw new ActionError(`${what} isn't a real date.`);
  if (day > storeDateOf(now)) throw new ActionError(`${what} can't be in the future.`);
  if (day < "2000-01-01") throw new ActionError(`${what} is before 2000. Check the year.`);
}

// ---------------------------------------------------------------- orders

export interface NewOrderInput {
  productId: string;
  supplierId: string;
  units: number;
  notes: string;
  orderedOn: StoreDate;
}

export function createOrder(state: AppState, input: NewOrderInput, actor: Actor, now: Date) {
  wholePositive(input.units, "Units");
  pastDay(input.orderedOn, "The order date", now);
  const product = state.products.find((p) => p.id === input.productId);
  if (!product) throw new ActionError("Pick a product.");
  if (!state.suppliers.some((s) => s.id === input.supplierId)) throw new ActionError("Pick a supplier.");

  // Product counter never goes backwards, so names stay unique even after deletes.
  const taken = new Set(state.orders.map((o) => o.name));
  let seq = product.nextOrderSeq;
  let name = orderName(product.code, seq);
  while (taken.has(name)) name = orderName(product.code, ++seq);

  const order: SupplierOrder = {
    id: newId(),
    name,
    productId: product.id,
    supplierId: input.supplierId,
    units: input.units,
    notes: input.notes.trim(),
    orderedOn: input.orderedOn,
    confirmedOn: null,
    tracking: [],
    state: "open",
    chasedAt: {},
    createdAt: now.toISOString(),
    history: [entry(actor, now, "Placed order", `${input.units} units`)],
    ...(product.unitCost !== undefined ? { unitCost: product.unitCost } : {}),
  };
  return {
    order,
    changes: merge(
      put("orders", order.id, order),
      put("products", product.id, { ...product, nextOrderSeq: seq + 1 }),
    ),
  };
}

export function orderName(code: string, seq: number) {
  return `${code}-${String(seq).padStart(3, "0")}`;
}

export interface OrderEdit {
  units: number;
  notes: string;
  supplierId: string;
}

export function editOrder(state: AppState, orderId: string, edit: OrderEdit, actor: Actor, now: Date): ChangeSet {
  const order = findOrder(state, orderId);
  wholePositive(edit.units, "Units");
  const { p } = progressOf(state, order);
  if (edit.units < p.tracked) throw new ActionError(`${p.tracked} units already have tracking. Units can't go below that.`);
  if (edit.units < p.arrived) throw new ActionError(`${p.arrived} units already arrived. Units can't go below that.`);
  const changes: string[] = [];
  if (edit.units !== order.units) changes.push(`units ${order.units} → ${edit.units}`);
  if (edit.supplierId !== order.supplierId) {
    const name = state.suppliers.find((s) => s.id === edit.supplierId)?.name ?? "another supplier";
    changes.push(`supplier → ${name}`);
  }
  if (edit.notes.trim() !== order.notes) changes.push("notes updated");
  if (!changes.length) return empty();
  return put(
    "orders",
    order.id,
    withHistory(order, entry(actor, now, "Edited order", changes.join(", ")), {
      units: edit.units,
      notes: edit.notes.trim(),
      supplierId: edit.supplierId,
    }),
  );
}

export function confirmOrder(state: AppState, orderId: string, actor: Actor, now: Date): ChangeSet {
  const order = findOrder(state, orderId);
  if (order.state !== "open") throw new ActionError("Only open orders can be confirmed.");
  if (order.confirmedOn) return empty();
  return put(
    "orders",
    order.id,
    withHistory(order, entry(actor, now, "Confirmed order", "In production"), { confirmedOn: storeDateOf(now) }),
  );
}

export interface TrackingInput {
  number: string;
  carrier: Tracking["carrier"];
  units: number;
  shippedOn: StoreDate;
}

export function addTracking(state: AppState, orderId: string, items: TrackingInput[], actor: Actor, now: Date): ChangeSet {
  const order = findOrder(state, orderId);
  if (order.state !== "open") throw new ActionError("Tracking can only be added to open orders.");
  if (!items.length) throw new ActionError("Add at least one tracking number.");
  const existing = new Set(order.tracking.map((t) => t.number.trim().toUpperCase()));
  for (const t of items) {
    if (!t.number.trim()) throw new ActionError("Each shipment needs a tracking number.");
    if (existing.has(t.number.trim().toUpperCase())) throw new ActionError(`${t.number.trim()} is already on this order.`);
    existing.add(t.number.trim().toUpperCase());
    wholePositive(t.units, "Units per tracking number");
    pastDay(t.shippedOn, "The ship date", now);
  }
  const already = order.tracking.reduce((s, t) => s + t.units, 0);
  const adding = items.reduce((s, t) => s + t.units, 0);
  if (already + adding > order.units) {
    throw new ActionError(
      `Tracking would cover ${already + adding} units, but the order is for ${order.units}. ${Math.max(0, order.units - already)} units can still get tracking.`,
    );
  }
  const tracking: Tracking[] = items.map((t) => ({
    id: newId(),
    number: t.number.trim(),
    carrier: t.carrier,
    units: t.units,
    shippedOn: t.shippedOn,
    addedAt: now.toISOString(),
  }));
  const detail = tracking.map((t) => `${t.carrier} ${t.number} · ${t.units} units`).join("; ");
  return put(
    "orders",
    order.id,
    withHistory(order, entry(actor, now, tracking.length > 1 ? "Added tracking numbers" : "Added tracking", detail), {
      tracking: [...order.tracking, ...tracking],
    }),
  );
}

export function removeTracking(state: AppState, orderId: string, trackingId: string, actor: Actor, now: Date): ChangeSet {
  const order = findOrder(state, orderId);
  const t = order.tracking.find((x) => x.id === trackingId);
  if (!t) return empty();
  return put(
    "orders",
    order.id,
    withHistory(order, entry(actor, now, "Removed tracking", `${t.carrier} ${t.number} · ${t.units} units`), {
      tracking: order.tracking.filter((x) => x.id !== trackingId),
    }),
  );
}

export function setOrderState(
  state: AppState,
  orderId: string,
  next: "cancelled" | "closed" | "open",
  actor: Actor,
  now: Date,
  reason = "",
): ChangeSet {
  const order = findOrder(state, orderId);
  if (order.state === next) return empty();
  const { p } = progressOf(state, order);
  if (next === "cancelled" && p.arrived > 0) {
    throw new ActionError(`${p.arrived} units already arrived. Close the order instead: that keeps what arrived and stops waiting for the rest.`);
  }
  const action = next === "cancelled" ? "Cancelled order" : next === "closed" ? "Closed order" : "Reopened order";
  const detail =
    next === "closed" ? `No more coming. ${p.remaining} units will not arrive.${reason ? ` ${reason}` : ""}` : reason || undefined;
  return put("orders", order.id, withHistory(order, entry(actor, now, action, detail), { state: next }));
}

/** Deleting frees any arrival units matched to the order; they show as unmatched. */
export function deleteOrder(state: AppState, orderId: string, actor: Actor, now: Date): ChangeSet {
  const order = findOrder(state, orderId);
  const out = empty();
  out.remove.push({ collection: "orders", id: order.id });
  for (const a of state.arrivals) {
    const freed = a.allocations.filter((al) => al.orderId === order.id).reduce((s, al) => s + al.units, 0);
    if (!freed) continue;
    out.put.push({
      collection: "arrivals",
      id: a.id,
      data: {
        ...a,
        allocations: a.allocations.filter((al) => al.orderId !== order.id),
        history: [...a.history, entry(actor, now, "Changed match", `${order.name} deleted, ${freed} units now unmatched`)],
      },
    });
  }
  return out;
}

export function recordChase(
  state: AppState,
  orderId: string,
  kind: ChaseKind,
  message: { to: string[]; subject: string; body: string },
  actor: Actor,
  now: Date,
): ChangeSet {
  const order = findOrder(state, orderId);
  return merge(
    put(
      "orders",
      order.id,
      withHistory(order, entry(actor, now, `Sent follow-up: ${CHASE_LABEL[kind]}`, message.to.join(", ")), {
        chasedAt: { ...order.chasedAt, [kind]: now.toISOString() },
      }),
    ),
    outboxMessage({ kind: "chase", orderId, ...message }, actor, now),
  );
}

export function recordOrderMessage(
  state: AppState,
  orderId: string,
  message: { to: string[]; subject: string; body: string },
  actor: Actor,
  now: Date,
): ChangeSet {
  const order = findOrder(state, orderId);
  return merge(
    put("orders", order.id, withHistory(order, entry(actor, now, "Sent order to supplier", message.to.join(", ")))),
    outboxMessage({ kind: "order", orderId, ...message }, actor, now),
  );
}

/**
 * Places several orders in one go (the "plan reorders" batch). Each order is
 * created against the state left by the ones before it, so names stay unique.
 */
export function createOrders(state: AppState, inputs: NewOrderInput[], actor: Actor, now: Date) {
  if (!inputs.length) throw new ActionError("Pick at least one product to order.");
  let working = state;
  const orders: SupplierOrder[] = [];
  const sets: ChangeSet[] = [];
  for (const input of inputs) {
    const { order, changes } = createOrder(working, input, actor, now);
    orders.push(order);
    sets.push(changes);
    const product = changes.put.find((p) => p.collection === "products")?.data as Product;
    working = {
      ...working,
      orders: [...working.orders, order],
      products: working.products.map((p) => (p.id === product.id ? product : p)),
    };
  }
  return { orders, changes: merge(...sets) };
}

/** One email to a supplier covering several orders: every order's history notes it, the outbox keeps one copy. */
export function recordBatchMessage(
  state: AppState,
  orderIds: string[],
  message: { to: string[]; subject: string; body: string },
  actor: Actor,
  now: Date,
): ChangeSet {
  const orders = orderIds.map((id) => findOrder(state, id));
  const msg: OutboxMessage = { id: newId(), at: now.toISOString(), actor, kind: "order", orderIds, ...message };
  return merge(
    ...orders.map((o) => put("orders", o.id, withHistory(o, entry(actor, now, "Sent order to supplier", message.to.join(", "))))),
    put("outbox", msg.id, msg),
  );
}

export function outboxMessage(
  m: Omit<OutboxMessage, "id" | "at" | "actor">,
  actor: Actor,
  now: Date,
): ChangeSet {
  const msg: OutboxMessage = { id: newId(), at: now.toISOString(), actor, ...m };
  return put("outbox", msg.id, msg);
}

// ---------------------------------------------------------------- arrivals

export interface ArrivalInput {
  productId: string;
  units: number;
  receivedOn: StoreDate;
  note: string;
  /** Leave out to match automatically; set to match by hand. */
  allocations?: Allocation[];
}

export function recordArrival(state: AppState, input: ArrivalInput, actor: Actor, now: Date) {
  wholePositive(input.units, "Units");
  pastDay(input.receivedOn, "The arrival date", now);
  if (!state.products.some((p) => p.id === input.productId)) throw new ActionError("Pick a product.");
  const caps = openCapacities(state, input.productId);
  let allocations: Allocation[];
  let how: string;
  if (input.allocations) {
    allocations = normalizeAllocations(input.allocations);
    const err = validateAllocations(
      input.units,
      allocations,
      new Map(caps.map((c) => [c.order.id, c.capacity])),
      new Map(state.orders.map((o) => [o.id, o.name])),
    );
    if (err) throw new ActionError(err);
    how = "matched by hand";
  } else {
    allocations = autoMatch(input.units, caps);
    how = "matched automatically, oldest order first";
  }
  const arrival: Arrival = {
    id: newId(),
    name: nextArrivalName(state),
    productId: input.productId,
    units: input.units,
    receivedOn: input.receivedOn,
    note: input.note.trim(),
    allocations,
    createdAt: now.toISOString(),
    history: [entry(actor, now, "Recorded arrival", `${input.units} units, ${how}. ${describe(state, allocations, input.units)}`)],
  };
  return { arrival, changes: put("arrivals", arrival.id, arrival) };
}

function nextArrivalName(state: AppState) {
  const max = state.arrivals.reduce((m, a) => Math.max(m, Number(a.name.replace(/\D/g, "")) || 0), 0);
  return `ARR-${String(max + 1).padStart(4, "0")}`;
}

/** "GRD-003 50, GRD-004 30, 20 unmatched" */
export function describe(state: AppState, allocations: Allocation[], total: number) {
  const names = new Map(state.orders.map((o) => [o.id, o.name]));
  const parts = allocations
    .filter((a) => a.units > 0)
    .map((a) => (a.orderId ? `${names.get(a.orderId) ?? "deleted order"} ${a.units}` : `not from an order ${a.units}`));
  const left = total - allocatedUnits({ allocations });
  if (left > 0) parts.push(`${left} unmatched`);
  return parts.length ? parts.join(", ") : "Nothing matched";
}

export function rematchArrival(
  state: AppState,
  arrivalId: string,
  allocations: Allocation[],
  actor: Actor,
  now: Date,
): ChangeSet {
  const arrival = state.arrivals.find((a) => a.id === arrivalId);
  if (!arrival) throw new ActionError("That arrival no longer exists.");
  const next = normalizeAllocations(allocations);
  const caps = openCapacities(state, arrival.productId, arrival.id);
  const capMap = new Map(caps.map((c) => [c.order.id, c.capacity]));
  // Orders already matched keep their current units as room even if they're now closed.
  for (const al of arrival.allocations) {
    if (al.orderId && !capMap.has(al.orderId)) capMap.set(al.orderId, al.units);
  }
  const err = validateAllocations(arrival.units, next, capMap, new Map(state.orders.map((o) => [o.id, o.name])));
  if (err) throw new ActionError(err);
  const before = describe(state, arrival.allocations, arrival.units);
  const after = describe(state, next, arrival.units);
  if (before === after) return empty();
  return put("arrivals", arrival.id, {
    ...arrival,
    allocations: next,
    history: [...arrival.history, entry(actor, now, "Changed match", `${before} → ${after}`)],
  });
}

export interface ArrivalEdit {
  units: number;
  receivedOn: StoreDate;
  note: string;
}

/**
 * Fixes an arrival typed in wrong. Extra units start unmatched. Fewer units
 * than are matched trim the match: "not from an order" first, then the
 * newest orders, so the oldest orders keep what they received.
 */
export function editArrival(state: AppState, arrivalId: string, edit: ArrivalEdit, actor: Actor, now: Date): ChangeSet {
  const arrival = state.arrivals.find((a) => a.id === arrivalId);
  if (!arrival) throw new ActionError("That arrival no longer exists.");
  wholePositive(edit.units, "Units");
  pastDay(edit.receivedOn, "The arrival date", now);

  const orderedOn = new Map(state.orders.map((o) => [o.id, o.orderedOn]));
  const names = new Map(state.orders.map((o) => [o.id, o.name]));
  const allocations = arrival.allocations.map((a) => ({ ...a }));
  let over = allocatedUnits({ allocations }) - edit.units;
  const trimmed: string[] = [];
  const releaseOrder = [...allocations].sort((a, b) => {
    if (!a.orderId) return -1;
    if (!b.orderId) return 1;
    return (orderedOn.get(b.orderId) ?? "").localeCompare(orderedOn.get(a.orderId) ?? "");
  });
  for (const al of releaseOrder) {
    if (over <= 0) break;
    const take = Math.min(al.units, over);
    al.units -= take;
    over -= take;
    trimmed.push(`${al.orderId ? (names.get(al.orderId) ?? "deleted order") : "not from an order"} −${take}`);
  }

  const changes: string[] = [];
  if (edit.units !== arrival.units) changes.push(`units ${arrival.units} → ${edit.units}`);
  if (edit.receivedOn !== arrival.receivedOn) changes.push(`received ${arrival.receivedOn} → ${edit.receivedOn}`);
  if (edit.note.trim() !== arrival.note) changes.push("note updated");
  if (!changes.length) return empty();
  const detail = changes.join(", ") + (trimmed.length ? `. Match trimmed: ${trimmed.join(", ")}` : "");
  return put("arrivals", arrival.id, {
    ...arrival,
    units: edit.units,
    receivedOn: edit.receivedOn,
    note: edit.note.trim(),
    allocations: normalizeAllocations(allocations),
    history: [...arrival.history, entry(actor, now, "Edited arrival", detail)],
  });
}

/**
 * Removes an arrival entered by mistake. Stock drops by its units and the
 * orders it fed count those units as still to come; each order's history
 * keeps a note of it.
 */
export function deleteArrival(state: AppState, arrivalId: string, actor: Actor, now: Date): ChangeSet {
  const arrival = state.arrivals.find((a) => a.id === arrivalId);
  if (!arrival) throw new ActionError("That arrival no longer exists.");
  const out: ChangeSet = { put: [], remove: [{ collection: "arrivals", id: arrival.id }], config: [] };
  for (const al of arrival.allocations) {
    if (!al.orderId || al.units <= 0) continue;
    const order = state.orders.find((o) => o.id === al.orderId);
    if (!order) continue;
    out.put.push({
      collection: "orders",
      id: order.id,
      data: withHistory(order, entry(actor, now, "Arrival deleted", `${arrival.name} removed, ${al.units} units no longer count as arrived`)),
    });
  }
  return out;
}

// ---------------------------------------------------------------- stock

export function logStockChange(
  state: AppState,
  input: { productId: string; kind: StockChangeKind; units: number; note: string; on: StoreDate },
  actor: Actor,
  now: Date,
): ChangeSet {
  if (!state.products.some((p) => p.id === input.productId)) throw new ActionError("Pick a product.");
  if (!Number.isInteger(input.units) || input.units === 0) throw new ActionError("Units must be a whole number other than 0.");
  if (Math.abs(input.units) > MAX_UNITS) throw new ActionError("Units can't be more than 1,000,000. Check for an extra digit.");
  pastDay(input.on, "The date", now);
  if (!input.note.trim()) throw new ActionError("Add a note saying why stock changed.");
  const units = input.kind === "manual_sale" ? -Math.abs(input.units) : input.units;
  const change: StockChange = {
    id: newId(),
    productId: input.productId,
    kind: input.kind,
    units,
    note: input.note.trim(),
    on: input.on,
    at: now.toISOString(),
    actor,
  };
  // A manual sale also counts toward sales speed: see unitsSoldByDay.
  return put("stockChanges", change.id, change);
}

// ---------------------------------------------------------------- setup

export function saveProduct(state: AppState, product: Product): ChangeSet {
  const code = product.code.trim().toUpperCase();
  if (!product.name.trim()) throw new ActionError("Give the product a name.");
  if (!/^[A-Z0-9]{2,8}$/.test(code)) throw new ActionError("Code must be 2–8 letters or digits, like GRD.");
  if (state.products.some((p) => p.id !== product.id && p.code.toUpperCase() === code)) {
    throw new ActionError(`Another product already uses the code ${code}.`);
  }
  if (!product.identifiers.length) throw new ActionError("Add at least one sales identifier (SKU).");
  const count = product.stockCount;
  if (!Number.isInteger(count.units) || count.units < 0 || count.units > 10 * MAX_UNITS) {
    throw new ActionError("Units in the warehouse must be a whole number from 0 to 10,000,000.");
  }
  if (!isStoreDate(count.date)) throw new ActionError("The stock count date isn't a real date.");
  const seen = new Set<string>();
  for (const id of product.identifiers) {
    const sku = id.sku.trim().toUpperCase();
    if (!sku) throw new ActionError("Every identifier needs a SKU.");
    if (seen.has(sku)) throw new ActionError(`${sku} is listed twice.`);
    seen.add(sku);
    if (!Number.isInteger(id.unitsPerSale) || id.unitsPerSale < 1) throw new ActionError(`${sku}: units per sale must be 1 or more.`);
    const owner = state.products.find((p) => p.id !== product.id && p.identifiers.some((i) => i.sku.toUpperCase() === sku));
    if (owner) throw new ActionError(`${sku} already belongs to ${owner.name}.`);
  }
  for (const [k, v] of Object.entries(product.forecast)) {
    if (v !== undefined && (!Number.isInteger(v) || v < 0)) throw new ActionError(`${k} must be a whole number of days.`);
  }
  if (product.unitCost !== undefined && (!Number.isFinite(product.unitCost) || product.unitCost < 0 || product.unitCost > 1_000_000)) {
    throw new ActionError("Unit cost must be a dollar amount of 0 or more.");
  }
  const { unitCost, ...rest } = product;
  const clean: Product = {
    ...rest,
    ...(unitCost !== undefined ? { unitCost: Math.round(unitCost * 100) / 100 } : {}),
    code,
    name: product.name.trim(),
    identifiers: product.identifiers.map((i) => ({ ...i, sku: i.sku.trim().toUpperCase(), label: i.label.trim() || i.sku })),
  };
  return put("products", clean.id, clean);
}

export function saveSupplier(state: AppState, supplier: Supplier): ChangeSet {
  if (!supplier.name.trim()) throw new ActionError("Give the supplier a name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(supplier.email.trim())) throw new ActionError("Enter a valid email address.");
  if (state.suppliers.some((s) => s.id !== supplier.id && s.name.trim().toLowerCase() === supplier.name.trim().toLowerCase())) {
    throw new ActionError("A supplier with that name already exists.");
  }
  return put("suppliers", supplier.id, { ...supplier, name: supplier.name.trim(), email: supplier.email.trim() });
}

export function saveSettings(settings: Settings): ChangeSet {
  const f = settings.forecast;
  for (const [k, v] of Object.entries(f)) {
    if (!Number.isInteger(v) || v < 0 || v > 365) throw new ActionError(`${k} must be a whole number of days between 0 and 365.`);
  }
  if (!(settings.staleAfterHours > 0)) throw new ActionError("Hours before data counts as old must be above 0.");
  for (const r of settings.reorderEmails.recipients) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r)) throw new ActionError(`${r} is not a valid email address.`);
  }
  return { put: [], remove: [], config: [{ doc: "settings", data: settings }] };
}
