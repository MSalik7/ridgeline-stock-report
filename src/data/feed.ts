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
import { stockLedger } from "@/domain/stock";
import type { AppState, ChangeSet, FeedStatus, SalesDay, StoreDate } from "@/domain/types";

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
 *
 * Walks the days in order keeping running totals (stock on hand per product,
 * sold and shipped per SKU), so each day costs the same however long the
 * history is.
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

  const prevDays = new Map(state.sales.map((d) => [d.date, d]));

  // Stock on hand at the start of `from`, and every non-shipping change from then on
  // (counts, arrivals, manual changes), per product.
  const stock = new Map<string, number>();
  const changes = new Map<string, Map<StoreDate, number>>();
  for (const p of state.products) {
    let start = 0;
    const byDay = new Map<StoreDate, number>();
    for (const e of stockLedger(state, p)) {
      if (e.date < from) start += e.change;
      else if (e.kind !== "shipped") byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.change);
    }
    stock.set(p.id, start);
    changes.set(p.id, byDay);
  }
  // Sold and shipped per SKU before `from`: the backlog the warehouse works through.
  const soldBefore = new Map<string, number>();
  const shippedBefore = new Map<string, number>();
  const add = (m: Map<string, number>, perSku: Record<string, number>) => {
    for (const [sku, n] of Object.entries(perSku)) m.set(sku, (m.get(sku) ?? 0) + n);
  };
  for (const d of state.sales) {
    if (d.date >= from) continue;
    add(soldBefore, d.sold);
    add(shippedBefore, d.shipped);
  }

  const touched: SalesDay[] = [];
  for (const date of dayRange(from, today)) {
    const fraction = date === today ? clamp01(hour / 24) : 1;
    const prev = prevDays.get(date);
    const sold: Record<string, number> = { ...(prev?.sold ?? {}) };
    for (const p of state.products) {
      for (const id of p.identifiers) {
        const n = simulatedSales(id.sku, date, anchor, fraction);
        // Never lower a number the store already reported.
        sold[id.sku] = Math.max(sold[id.sku] ?? 0, n);
      }
    }

    // Ship the backlog from earlier days, as far as the morning's stock allows.
    const day: SalesDay = { date, sold, shipped: {} };
    const ship = date === today ? shippingFraction(hour) : 1;
    for (const p of state.products) {
      let onHand = stock.get(p.id)! + (changes.get(p.id)!.get(date) ?? 0);
      // Bundles first is arbitrary; any fixed order keeps the result repeatable.
      for (const id of p.identifiers) {
        const backlog = Math.max(0, (soldBefore.get(id.sku) ?? 0) - (shippedBefore.get(id.sku) ?? 0));
        const canShip = Math.min(Math.floor(backlog * ship), Math.floor(Math.max(0, onHand) / id.unitsPerSale));
        if (canShip > 0) {
          day.shipped[id.sku] = canShip;
          onHand -= canShip * id.unitsPerSale;
        }
      }
    }
    // Keep any shipments already reported for this day if they were higher.
    for (const [sku, n] of Object.entries(prev?.shipped ?? {})) {
      day.shipped[sku] = Math.max(day.shipped[sku] ?? 0, n);
    }

    // Close the day: stock left after shipping, and the running totals.
    for (const p of state.products) {
      let onHand = stock.get(p.id)! + (changes.get(p.id)!.get(date) ?? 0);
      for (const id of p.identifiers) onHand -= (day.shipped[id.sku] ?? 0) * id.unitsPerSale;
      stock.set(p.id, onHand);
    }
    add(soldBefore, day.sold);
    add(shippedBefore, day.shipped);
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

/** First day the generator reports, for seeding. */
export function feedStartFor(today: StoreDate, days: number) {
  return addDays(today, -days);
}
