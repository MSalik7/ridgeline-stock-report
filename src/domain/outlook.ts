/**
 * Stock outlook: when open orders should land, and whether stock runs out
 * before they do.
 *
 * The SOP's "days with everything ordered" counts ordered units as if they
 * were already on the shelf. That answers "is enough coming?" but not "will
 * we run out before it gets here?". This module adds the timing on top,
 * without changing any SOP number.
 */
import { addDays, daysBetween } from "./dates";
import { shipmentStates, type OrderProgress } from "./orders";
import type { StoreDate, SupplierOrder } from "./types";

/**
 * Days from a supplier handing a shipment to the carrier to it arriving.
 * Matches the SOP chase rule: a shipment on the way more than 10 days is late.
 */
export const TRANSIT_DAYS = 10;

export interface Incoming {
  orderId: string;
  orderName: string;
  units: number;
  /** Best estimate of the arrival day. */
  expectedOn: StoreDate;
  /** Tracked shipments: ship date + transit. Everything else: order date + lead time. */
  basis: "tracking" | "lead time";
  /** Expected date has passed and the units still aren't here. */
  late: boolean;
  daysLate: number;
}

/** What is still to come for one open order, and when. */
export function incomingForOrder(order: SupplierOrder, p: OrderProgress, leadTimeDays: number, today: StoreDate): Incoming[] {
  const out: Incoming[] = [];
  const push = (units: number, expectedOn: StoreDate, basis: Incoming["basis"]) => {
    const daysLate = Math.max(0, daysBetween(expectedOn, today));
    out.push({ orderId: order.id, orderName: order.name, units, expectedOn, basis, late: daysLate > 0, daysLate });
  };
  for (const s of shipmentStates(order, p.arrived)) {
    if (s.onTheWayUnits > 0) push(s.onTheWayUnits, addDays(s.tracking.shippedOn, TRANSIT_DAYS), "tracking");
  }
  const untracked = p.placed + p.inProduction;
  if (untracked > 0) push(untracked, addDays(order.orderedOn, leadTimeDays), "lead time");
  return out;
}

export interface Gap {
  /** First day demand can't be met. */
  from: StoreDate;
  /** Day stock comes back, or null if nothing on time arrives within the outlook. */
  to: StoreDate | null;
  days: number | null;
}

export interface Outlook {
  incoming: Incoming[];
  /** Projected stock at the end of each day, today first. */
  projection: { date: StoreDate; stock: number }[];
  gaps: Gap[];
  /** First gap, if any: the day stock runs out. */
  runsOutOn: StoreDate | null;
  /** The arrival that ends the first gap, or the next late shipment if none is on time. */
  nextStock: Incoming | null;
  horizon: number;
}

/**
 * Projects stock day by day: arrivals land in the morning, the day's sales
 * (adjusted burn) go out after. Late shipments have no reliable date, so the
 * projection leaves them out and lists them instead.
 */
export function buildOutlook(input: {
  stock: number;
  burn: number;
  incoming: Incoming[];
  today: StoreDate;
  minHorizon: number;
}): Outlook {
  const { burn, today } = input;
  const incoming = [...input.incoming].sort((a, b) => a.expectedOn.localeCompare(b.expectedOn));
  const onTime = incoming.filter((i) => !i.late);
  const lastDay = onTime.length ? daysBetween(today, onTime[onTime.length - 1].expectedOn) : 0;
  const horizon = Math.min(120, Math.max(input.minHorizon, lastDay + 14, 30));

  const arrivals = new Map<number, number>();
  for (const i of onTime) {
    const k = Math.max(1, daysBetween(today, i.expectedOn));
    arrivals.set(k, (arrivals.get(k) ?? 0) + i.units);
  }

  const projection: Outlook["projection"] = [];
  const out: boolean[] = [];
  let level = Math.max(0, input.stock);
  for (let k = 0; k <= horizon; k++) {
    const available = level + (k > 0 ? (arrivals.get(k) ?? 0) : 0);
    const short = burn > 0 && available - burn < 0;
    level = Math.max(0, available - burn);
    projection.push({ date: addDays(today, k), stock: level });
    out.push(short);
  }

  const gaps: Gap[] = [];
  for (let k = 0; k <= horizon; k++) {
    if (!out[k] || (k > 0 && out[k - 1])) continue;
    let end = k;
    while (end <= horizon && out[end]) end++;
    const to = end <= horizon ? addDays(today, end) : null;
    gaps.push({ from: addDays(today, k), to, days: to ? end - k : null });
  }

  const first = gaps[0];
  const nextStock = first
    ? (onTime.find((i) => first.to !== null && i.expectedOn >= first.to) ?? incoming.find((i) => i.late) ?? null)
    : null;

  return { incoming, projection, gaps, runsOutOn: first?.from ?? null, nextStock, horizon };
}
