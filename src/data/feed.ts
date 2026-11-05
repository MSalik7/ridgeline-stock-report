/**
 * Simulated store + warehouse feed.
 *
 * The SOP rules out outside services, so sales and shipments come from a
 * deterministic generator that behaves like a store's daily export: the same
 * SKU on the same day always gives the same number. "Sync now" pulls every
 * day since the last sync, so the forecast keeps showing real values no
 * matter when someone opens the app.
 */
import { addDays, daysBetween, dayRange, storeDateOf, storeHourOf } from "@/domain/dates";
import { stockBeforeShipping } from "@/domain/stock";
import type { AppState, ChangeSet, FeedStatus, Product, SalesDay, StoreDate } from "@/domain/types";

interface SkuProfile {
  /** Average sales per day around the demo anchor. */
  base: number;
  /** Multiplier by days from the anchor (negative = before). */
  shape?: (k: number) => number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Sales patterns of the demo catalog. Unknown SKUs sell nothing. */
const PROFILES: Record<string, SkuProfile> = {
  // Gooseneck kettle: steady seller.
  "KTL-1L": { base: 8.5 },
  // Burr grinder: climbing for weeks, then a gift-guide feature lifts the last few days.
  "GRD-HB": {
    base: 10,
    shape: (k) => (k < 0 ? 0.45 + 0.55 * clamp01((k + 45) / 42) : 1) * (k >= -3 && k < 0 ? 1.45 : 1),
  },
  // Ceramic dripper: slow and steady.
  "DRP-02": { base: 3.6 },
  // Paper filters: high volume, plus a buy-2-get-2 bundle that takes 4 packs per sale.
  "FLT-100": { base: 17 },
  "FLT-100-B2G2": { base: 3.2 },
  // Cold brew jar: a summer product fading into winter.
  "CBJ-15": { base: 2.6, shape: (k) => (k < 0 ? 2.1 - 1.1 * clamp01((k + 45) / 45) : 1) * (k >= -3 && k < 0 ? 0.8 : 1) },
  // Travel mug, single and a 2-pack.
  "MUG-12": { base: 5.8 },
  "MUG-12-2PK": { base: 1.4 },
};

/** Small deterministic hash -> [0, 1). */
function noise(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Weekends sell a little more. */
function weekday(date: StoreDate): number {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6 ? 1.25 : dow === 1 ? 0.9 : 1;
}

/** Sales of one SKU on one day; `fraction` < 1 for a day still in progress. */
export function simulatedSales(sku: string, date: StoreDate, anchor: StoreDate, fraction = 1): number {
  const p = PROFILES[sku];
  if (!p) return 0;
  const k = daysBetween(anchor, date);
  const mean = p.base * (p.shape ? p.shape(k) : 1) * weekday(date);
  const full = Math.max(0, Math.round(mean * (0.82 + 0.36 * noise(`${sku}|${date}`))));
  return Math.floor(full * fraction);
}

/** The warehouse ships the backlog from earlier days, 8 AM to 4 PM store time. */
function shippingFraction(hour: number) {
  return clamp01((hour - 8) / 8);
}

/**
 * Pulls sales and shipments from the last sync up to `now`.
 * Re-runs the last synced day too, since it may have been a partial day.
 */
export function syncFeed(state: AppState, now: Date): ChangeSet {
  const today = storeDateOf(now);
  const hour = storeHourOf(now);
  const anchor = state.feed.demoAnchor ?? today;
  const earliest = state.products.reduce(
    (m, p) => (p.stockCount.date < m ? p.stockCount.date : m),
    today,
  );
  const from = state.feed.salesSyncedAt ? storeDateOf(state.feed.salesSyncedAt) : earliest;
  if (from > today) return { put: [], remove: [], config: [] };

  // Work on a copy so each day's shipping sees the stock left by the day before.
  const days = new Map(state.sales.map((d) => [d.date, d]));
  const work: AppState = { ...state, sales: [...state.sales] };
  const touched: SalesDay[] = [];

  for (const date of dayRange(from, today)) {
    const fraction = date === today ? clamp01(hour / 24) : 1;
    const prev = days.get(date);
    const sold: Record<string, number> = { ...(prev?.sold ?? {}) };
    for (const p of state.products) {
      for (const id of p.identifiers) {
        const n = simulatedSales(id.sku, date, anchor, fraction);
        // Never lower a number the store already reported.
        sold[id.sku] = Math.max(sold[id.sku] ?? 0, n);
      }
    }

    // Backlog = everything sold before today minus everything shipped before today.
    const day: SalesDay = { date, sold, shipped: {} };
    setDay(work, day);
    const ship = date === today ? shippingFraction(hour) : 1;
    for (const p of state.products) shipProduct(work, p, date, ship, day);

    // Keep any shipments already reported for this day if they were higher.
    for (const [sku, n] of Object.entries(prev?.shipped ?? {})) {
      day.shipped[sku] = Math.max(day.shipped[sku] ?? 0, n);
    }
    setDay(work, day);
    days.set(date, day);
    touched.push(day);
  }

  const at = now.toISOString();
  const feed: FeedStatus = { ...state.feed, salesSyncedAt: at, stockSyncedAt: at, demoAnchor: anchor };
  return {
    put: touched.map((d) => ({ collection: "sales" as const, id: d.date, data: d })),
    remove: [],
    config: [{ doc: "feed", data: feed }],
  };
}

function setDay(work: AppState, day: SalesDay) {
  const i = work.sales.findIndex((d) => d.date === day.date);
  if (i >= 0) work.sales[i] = day;
  else work.sales.push(day);
}

function shipProduct(work: AppState, product: Product, date: StoreDate, fraction: number, day: SalesDay) {
  let stock = stockBeforeShipping(work, product, date);
  // Bundles first is arbitrary; any fixed order keeps the result repeatable.
  for (const id of product.identifiers) {
    let soldBefore = 0;
    let shippedBefore = 0;
    for (const d of work.sales) {
      if (d.date < date) {
        soldBefore += d.sold[id.sku] ?? 0;
        shippedBefore += d.shipped[id.sku] ?? 0;
      }
    }
    const backlog = Math.max(0, soldBefore - shippedBefore);
    const want = Math.floor(backlog * fraction);
    const canShip = Math.min(want, Math.floor(Math.max(0, stock) / id.unitsPerSale));
    if (canShip > 0) {
      day.shipped[id.sku] = canShip;
      stock -= canShip * id.unitsPerSale;
    }
  }
}

/** First day the generator reports, for seeding. */
export function feedStartFor(today: StoreDate, days: number) {
  return addDays(today, -days);
}
