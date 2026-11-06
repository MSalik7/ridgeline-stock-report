/**
 * Shape checks for data read back from storage (this browser's private
 * copy, or the shared database), before any screen touches it.
 *
 * Storage is outside the app's control: an older version, a hand edit or
 * a half-written save can leave records the screens would crash on. A
 * record that doesn't have the fields the app reads is set aside instead,
 * and data that isn't a business at all is rejected so the caller can
 * start fresh.
 */
import { isStoreDate } from "./dates";
import type { AppState, Arrival, OutboxMessage, Product, SalesDay, Settings, StockChange, Supplier, SupplierOrder } from "./types";

type Rec = Record<string, unknown>;

const isObj = (x: unknown): x is Rec => typeof x === "object" && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === "string";
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isDay = isStoreDate;
const isArr = Array.isArray;
const isHistory = (x: unknown) => isArr(x) && x.every((h) => isObj(h) && isStr(h.at) && isStr(h.action) && isObj(h.actor));
const isCounts = (x: unknown) => isObj(x) && Object.values(x).every(isNum);

const CHECKS = {
  products: (p: Rec) =>
    isStr(p.id) &&
    isStr(p.code) &&
    isStr(p.name) &&
    isStr(p.supplierId) &&
    isArr(p.identifiers) &&
    p.identifiers.every((i) => isObj(i) && isStr(i.sku) && isNum(i.unitsPerSale) && i.unitsPerSale > 0) &&
    isObj(p.stockCount) &&
    isNum(p.stockCount.units) &&
    isDay(p.stockCount.date) &&
    isObj(p.forecast) &&
    (p.unitCost === undefined || isNum(p.unitCost)),
  suppliers: (s: Rec) => isStr(s.id) && isStr(s.name),
  orders: (o: Rec) =>
    isStr(o.id) &&
    isStr(o.name) &&
    isStr(o.productId) &&
    isStr(o.supplierId) &&
    isNum(o.units) &&
    isDay(o.orderedOn) &&
    (o.confirmedOn === null || isDay(o.confirmedOn)) &&
    isArr(o.tracking) &&
    o.tracking.every((t) => isObj(t) && isStr(t.id) && isNum(t.units) && isDay(t.shippedOn)) &&
    isStr(o.state) &&
    isObj(o.chasedAt) &&
    isHistory(o.history),
  arrivals: (a: Rec) =>
    isStr(a.id) &&
    isStr(a.name) &&
    isStr(a.productId) &&
    isNum(a.units) &&
    isDay(a.receivedOn) &&
    isArr(a.allocations) &&
    a.allocations.every((al) => isObj(al) && (al.orderId === null || isStr(al.orderId)) && isNum(al.units)) &&
    isHistory(a.history),
  stockChanges: (c: Rec) => isStr(c.id) && isStr(c.productId) && isStr(c.kind) && isNum(c.units) && isDay(c.on) && isStr(c.at),
  sales: (d: Rec) => isDay(d.date) && isCounts(d.sold) && isCounts(d.shipped),
  outbox: (m: Rec) => isStr(m.id) && isStr(m.at) && isStr(m.kind) && isArr(m.to) && isStr(m.subject) && isStr(m.body),
} satisfies Record<string, (r: Rec) => boolean>;

export type Collection = keyof typeof CHECKS;

interface Typed {
  products: Product;
  suppliers: Supplier;
  orders: SupplierOrder;
  arrivals: Arrival;
  stockChanges: StockChange;
  sales: SalesDay;
  outbox: OutboxMessage;
}

/** Records of one collection the screens can safely read, and how many were set aside. */
export function validRecords<C extends Collection>(c: C, rows: unknown): { rows: Typed[C][]; dropped: number } {
  if (!isArr(rows)) return { rows: [], dropped: 0 };
  const ok = rows.filter((r): r is Typed[C] => isObj(r) && CHECKS[c](r));
  return { rows: ok, dropped: rows.length - ok.length };
}

export function validSettings(x: unknown): x is Settings {
  return (
    isObj(x) &&
    isStr(x.storeName) &&
    isObj(x.forecast) &&
    isNum(x.forecast.leadTimeDays) &&
    isNum(x.forecast.safetyDays) &&
    isNum(x.forecast.targetDays) &&
    isNum(x.staleAfterHours) &&
    isObj(x.reorderEmails) &&
    isArr(x.reorderEmails.recipients)
  );
}

const COLLECTIONS: Collection[] = ["products", "suppliers", "orders", "arrivals", "stockChanges", "sales", "outbox"];

/**
 * A whole saved business, cleaned: `null` when it isn't one (wrong type,
 * missing collections, unusable settings), otherwise the business with any
 * broken records left out.
 */
export function cleanState(x: unknown): { state: AppState; dropped: number } | null {
  if (!isObj(x) || !validSettings(x.settings) || !COLLECTIONS.every((c) => isArr(x[c]))) return null;
  let dropped = 0;
  const parts = Object.fromEntries(
    COLLECTIONS.map((c) => {
      const v = validRecords(c, x[c]);
      dropped += v.dropped;
      return [c, v.rows];
    }),
  ) as Pick<AppState, Collection>;
  const feed = isObj(x.feed) ? x.feed : {};
  return {
    state: {
      ...parts,
      settings: x.settings,
      feed: {
        salesSyncedAt: isStr(feed.salesSyncedAt) ? feed.salesSyncedAt : null,
        stockSyncedAt: isStr(feed.stockSyncedAt) ? feed.stockSyncedAt : null,
        ...(isDay(feed.demoAnchor) ? { demoAnchor: feed.demoAnchor } : {}),
      },
    },
    dropped,
  };
}
