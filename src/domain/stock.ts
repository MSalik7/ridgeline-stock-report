import { storeDateOf } from "./dates";
import { unitsShippedByDay } from "./sales";
import type { Actor, AppState, Product, StoreDate, Timestamp } from "./types";

export type LedgerKind = "count" | "arrival" | "shipped" | "manual_sale" | "adjustment" | "rematch" | "correction";

export const LEDGER_LABEL: Record<LedgerKind, string> = {
  count: "Stock count",
  arrival: "Arrival",
  shipped: "Shipped to customers",
  manual_sale: "Manual sale",
  adjustment: "Adjustment",
  rematch: "Moved between orders",
  correction: "Arrival corrected",
};

/** One line of a product's stock history: what changed, when and why. */
export interface LedgerEntry {
  key: string;
  productId: string;
  date: StoreDate;
  at: Timestamp | null;
  kind: LedgerKind;
  /** Change to warehouse stock; 0 for moves between orders. */
  change: number;
  /** Warehouse stock after this line. */
  balance: number;
  why: string;
  actor: Actor | null;
  /** Arrival or order this line belongs to. */
  ref?: { arrivalId?: string; orderIds?: string[] };
}

const KIND_ORDER: Record<LedgerKind, number> = {
  count: 0,
  arrival: 1,
  rematch: 2,
  correction: 2,
  manual_sale: 3,
  adjustment: 3,
  shipped: 4,
};

/**
 * Warehouse stock is a ledger: the last physical count, plus arrivals and
 * hand-entered changes, minus what the warehouse shipped to customers.
 * Moves between orders are listed too but don't change stock.
 */
export function stockLedger(state: AppState, product: Product): LedgerEntry[] {
  const start = product.stockCount.date;
  const orderName = new Map(state.orders.map((o) => [o.id, o.name]));
  const rows: Omit<LedgerEntry, "balance">[] = [
    {
      key: `count-${product.id}`,
      productId: product.id,
      date: start,
      at: null,
      kind: "count",
      change: product.stockCount.units,
      why: "Physical count, opening balance",
      actor: null,
    },
  ];

  for (const a of state.arrivals) {
    if (a.productId !== product.id || a.receivedOn < start) continue;
    const parts = a.allocations
      .filter((al) => al.units > 0)
      .map((al) => (al.orderId ? `${orderName.get(al.orderId) ?? "deleted order"} ${al.units}` : `not from an order ${al.units}`));
    const unmatched = a.units - a.allocations.reduce((s, al) => s + al.units, 0);
    if (unmatched > 0) parts.push(`unmatched ${unmatched}`);
    rows.push({
      key: `arr-${a.id}`,
      productId: product.id,
      date: a.receivedOn,
      at: a.createdAt,
      kind: "arrival",
      change: a.units,
      why: `${a.name}${parts.length ? ` · ${parts.join(", ")}` : ""}${a.note ? ` · ${a.note}` : ""}`,
      actor: a.history[0]?.actor ?? null,
      ref: { arrivalId: a.id, orderIds: a.allocations.flatMap((al) => (al.orderId ? [al.orderId] : [])) },
    });
    for (const [i, h] of a.history.entries()) {
      if (h.action !== "Changed match" && h.action !== "Edited arrival") continue;
      // The arrival line already carries the corrected units; this line records when and why.
      rows.push({
        key: `rem-${a.id}-${i}`,
        productId: product.id,
        date: maxDate(storeDateOf(h.at), a.receivedOn),
        at: h.at,
        kind: h.action === "Edited arrival" ? "correction" : "rematch",
        change: 0,
        why: `${a.name}: ${h.detail ?? "match changed"}`,
        actor: h.actor,
        ref: { arrivalId: a.id },
      });
    }
  }

  for (const c of state.stockChanges) {
    if (c.productId !== product.id || c.on < start) continue;
    rows.push({
      key: `chg-${c.id}`,
      productId: product.id,
      date: c.on,
      at: c.at,
      kind: c.kind,
      change: c.units,
      why: c.note,
      actor: c.actor,
    });
  }

  for (const [date, units] of unitsShippedByDay(state.sales, product)) {
    if (date < start) continue;
    rows.push({
      key: `ship-${product.id}-${date}`,
      productId: product.id,
      date,
      at: null,
      kind: "shipped",
      change: -units,
      why: "Warehouse shipped customer orders",
      actor: null,
    });
  }

  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.at ?? "").localeCompare(b.at ?? ""),
  );

  let balance = 0;
  return rows.map((r) => {
    balance += r.change;
    return { ...r, balance };
  });
}

function maxDate(a: StoreDate, b: StoreDate) {
  return a > b ? a : b;
}

/** Stock on hand at the start of `date`'s shipping: everything before it, plus that day's arrivals and changes. */
export function stockBeforeShipping(state: AppState, product: Product, date: StoreDate): number {
  return stockLedger(state, product)
    .filter((r) => r.date < date || (r.date === date && r.kind !== "shipped"))
    .reduce((s, r) => s + r.change, 0);
}

export function warehouseStock(state: AppState, product: Product): number {
  const ledger = stockLedger(state, product);
  return ledger.length ? ledger[ledger.length - 1].balance : 0;
}
