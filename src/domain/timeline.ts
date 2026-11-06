/**
 * One product's stock, day by day: the actual end-of-day balance from the
 * first count up to today (from the stock ledger), then the projection
 * (from the outlook). Each day carries what moved stock that day, so a
 * chart can show exact numbers and reasons on hover.
 */
import { addDays, daysBetween } from "./dates";
import type { Incoming } from "./outlook";
import type { ProductRow } from "./report";
import { LEDGER_LABEL, stockLedger, type LedgerKind } from "./stock";
import type { AppState, StoreDate } from "./types";

export interface TimelineEvent {
  kind: LedgerKind | "incoming" | "sales";
  label: string;
  /** Units in or out (projected sales can be fractional). */
  change: number;
  detail?: string;
}

export interface TimelinePoint {
  date: StoreDate;
  /** End-of-day stock: actual up to today, projected after. */
  stock: number;
  projected: boolean;
  /** Projected days without enough stock for the day's sales. */
  short: boolean;
  events: TimelineEvent[];
}

export interface Timeline {
  points: TimelinePoint[];
  todayIndex: number;
}

export function stockTimeline(state: AppState, row: ProductRow, today: StoreDate): Timeline {
  const ledger = stockLedger(state, row.product);
  const byDate = new Map<StoreDate, typeof ledger>();
  for (const l of ledger) byDate.set(l.date, [...(byDate.get(l.date) ?? []), l]);

  const points: TimelinePoint[] = [];
  const start = ledger[0]?.date ?? today;
  let balance = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const day = byDate.get(d) ?? [];
    for (const l of day) balance = l.balance;
    points.push({
      date: d,
      stock: balance,
      projected: false,
      short: false,
      events: day.map((l) => ({
        kind: l.kind,
        label: LEDGER_LABEL[l.kind],
        change: l.change,
        detail: l.kind === "shipped" ? undefined : l.why,
      })),
    });
  }
  const todayIndex = points.length - 1;

  const o = row.outlook;
  const burn = row.forecast.adjustedBurn;
  const landing = new Map<number, Incoming[]>();
  for (const inc of o.incoming) {
    if (inc.late) continue;
    const k = Math.max(1, daysBetween(today, inc.expectedOn));
    landing.set(k, [...(landing.get(k) ?? []), inc]);
  }
  const inGap = (d: StoreDate) => o.gaps.some((g) => d >= g.from && (g.to === null || d < g.to));

  for (let k = 1; k < o.projection.length; k++) {
    const p = o.projection[k];
    const events: TimelineEvent[] = (landing.get(k) ?? []).map((inc) => ({
      kind: "incoming",
      label: `${inc.orderName} lands`,
      change: inc.units,
      detail: inc.basis === "tracking" ? "Ship date + 10 days" : "Order date + lead time",
    }));
    if (burn > 0) events.push({ kind: "sales", label: "Projected sales", change: -burn });
    points.push({ date: p.date, stock: p.stock, projected: true, short: inGap(p.date), events });
  }
  return { points, todayIndex };
}
