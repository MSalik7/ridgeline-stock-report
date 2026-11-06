import { addDays, byTime, daysBetween, storeDateOf } from "./dates";
import type { Arrival, ChaseKind, StoreDate, SupplierOrder, Timestamp, Tracking } from "./types";

/**
 * Where an order's units are, per SOP section 4 "Order stages".
 *
 * Arrivals use up tracked shipments first (oldest shipment first), so
 * on-the-way = tracked units not yet arrived; whatever is confirmed but has
 * neither tracking nor an arrival is in production.
 */
export interface OrderProgress {
  ordered: number;
  arrived: number;
  tracked: number;
  /** Units still to come (ordered - arrived, never below 0). */
  remaining: number;
  placed: number;
  inProduction: number;
  onTheWay: number;
  /** Units still to come that have no tracking yet. */
  untracked: number;
  confirmed: boolean;
  /** When it became confirmed: marked, first tracking or first arrival, whichever came first. */
  confirmedOn: StoreDate | null;
  firstArrivalOn: StoreDate | null;
}

export type OrderStatus =
  | "cancelled"
  | "closed"
  | "received"
  | "partial"
  | "on_the_way"
  | "in_production"
  | "placed";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  cancelled: "Cancelled",
  closed: "Closed",
  received: "Received",
  partial: "Partly arrived",
  on_the_way: "On the way",
  in_production: "In production",
  placed: "Placed",
};

/** Statuses whose remaining units count toward stock numbers. */
export const OPEN_STATUSES: OrderStatus[] = ["placed", "in_production", "on_the_way", "partial"];

export function isOpenStatus(s: OrderStatus): boolean {
  return OPEN_STATUSES.includes(s);
}

/** Units allocated to each order across all arrivals, plus the first arrival day. */
export function arrivalsByOrder(arrivals: Arrival[]) {
  const map = new Map<string, { units: number; firstOn: StoreDate }>();
  for (const a of arrivals) {
    for (const al of a.allocations) {
      if (!al.orderId || al.units <= 0) continue;
      const cur = map.get(al.orderId);
      if (!cur) map.set(al.orderId, { units: al.units, firstOn: a.receivedOn });
      else {
        cur.units += al.units;
        if (a.receivedOn < cur.firstOn) cur.firstOn = a.receivedOn;
      }
    }
  }
  return map;
}

export function orderProgress(
  order: SupplierOrder,
  arrived: { units: number; firstOn: StoreDate } | undefined,
): OrderProgress {
  const ordered = order.units;
  const arrivedUnits = arrived?.units ?? 0;
  const tracked = order.tracking.reduce((s, t) => s + t.units, 0);
  const remaining = Math.max(0, ordered - arrivedUnits);
  const onTheWay = Math.min(remaining, Math.max(0, tracked - arrivedUnits));

  const candidates: StoreDate[] = [];
  if (order.confirmedOn) candidates.push(order.confirmedOn);
  for (const t of order.tracking) candidates.push(minDate(t.shippedOn, storeDateOf(t.addedAt)));
  if (arrived) candidates.push(arrived.firstOn);
  const confirmedOn = candidates.length ? candidates.sort()[0] : null;
  const confirmed = confirmedOn !== null;

  const notShipped = remaining - onTheWay;
  return {
    ordered,
    arrived: arrivedUnits,
    tracked,
    remaining,
    placed: confirmed ? 0 : notShipped,
    inProduction: confirmed ? notShipped : 0,
    onTheWay,
    untracked: notShipped,
    confirmed,
    confirmedOn,
    firstArrivalOn: arrived?.firstOn ?? null,
  };
}

function minDate(a: StoreDate, b: StoreDate) {
  return a < b ? a : b;
}

/** Overall status, first match wins (SOP section 4). */
export function orderStatus(order: SupplierOrder, p: OrderProgress): OrderStatus {
  if (order.state === "cancelled") return "cancelled";
  if (order.state === "closed") return "closed";
  if (p.remaining === 0) return "received";
  if (p.arrived > 0) return "partial";
  if (p.onTheWay > 0) return "on_the_way";
  if (p.confirmed) return "in_production";
  return "placed";
}

/** Each tracked shipment and whether it has arrived, consuming arrivals oldest shipment first. */
export function shipmentStates(order: SupplierOrder, arrivedUnits: number) {
  let left = arrivedUnits;
  return [...order.tracking]
    .sort((a, b) => byTime(a.shippedOn, b.shippedOn) || byTime(a.addedAt, b.addedAt))
    .map((t) => {
      const covered = Math.min(t.units, left);
      left -= covered;
      return { tracking: t, arrivedUnits: covered, onTheWayUnits: t.units - covered };
    });
}

export interface ChaseAlert {
  orderId: string;
  kind: ChaseKind;
  /** Plain sentence: why this order needs a follow-up. */
  reason: string;
  /** Day the rule started to apply. */
  since: StoreDate;
  /** False while a follow-up was sent less than 2 days ago. */
  due: boolean;
  lastChasedAt: Timestamp | null;
  nextDueOn: StoreDate | null;
}

export const CHASE_LABEL: Record<ChaseKind, string> = {
  confirm: "Ask to confirm",
  tracking: "Ask for tracking",
  whereabouts: "Ask where it is",
};

/** Days between repeats of the same follow-up while its reason still applies. */
export const CHASE_REPEAT_DAYS = 2;

/** Chase rules, SOP section 4. Only open orders are chased. */
export function chaseAlerts(
  order: SupplierOrder,
  p: OrderProgress,
  status: OrderStatus,
  today: StoreDate,
): ChaseAlert[] {
  if (!isOpenStatus(status)) return [];
  const found: { kind: ChaseKind; reason: string; since: StoreDate }[] = [];

  const sinceOrdered = daysBetween(order.orderedOn, today);
  if (!p.confirmed && sinceOrdered >= 2) {
    found.push({
      kind: "confirm",
      reason: `Not confirmed ${sinceOrdered} days after ordering`,
      since: addDays(order.orderedOn, 2),
    });
  }

  if (p.confirmed && p.confirmedOn && p.untracked > 0) {
    const sinceConfirmed = daysBetween(p.confirmedOn, today);
    if (sinceConfirmed >= 10) {
      found.push({
        kind: "tracking",
        reason: `Confirmed ${sinceConfirmed} days ago, ${p.untracked} units still without tracking`,
        since: addDays(p.confirmedOn, 10),
      });
    }
  }

  const late = shipmentStates(order, p.arrived)
    .filter((s) => s.onTheWayUnits > 0 && daysBetween(s.tracking.shippedOn, today) > 10)
    .map((s) => s.tracking);
  if (late.length) {
    const oldest = late[0];
    const days = daysBetween(oldest.shippedOn, today);
    found.push({
      kind: "whereabouts",
      reason:
        late.length === 1
          ? `Shipment ${oldest.number} on the way for ${days} days`
          : `${late.length} shipments on the way for more than 10 days (oldest ${days} days)`,
      since: addDays(oldest.shippedOn, 11),
    });
  }

  return found.map((f) => {
    const last = order.chasedAt[f.kind] ?? null;
    const lastDay = last ? storeDateOf(last) : null;
    // A follow-up sent before the reason began doesn't count for this occurrence.
    const counts = lastDay !== null && lastDay >= f.since;
    const due = !counts || daysBetween(lastDay!, today) >= CHASE_REPEAT_DAYS;
    return {
      orderId: order.id,
      kind: f.kind,
      reason: f.reason,
      since: f.since,
      due,
      lastChasedAt: counts ? last : null,
      nextDueOn: counts && !due ? addDays(lastDay!, CHASE_REPEAT_DAYS) : null,
    };
  });
}

/** Carrier tracking pages. */
export function trackingUrl(t: Pick<Tracking, "carrier" | "number">): string | null {
  const n = encodeURIComponent(t.number.trim());
  switch (t.carrier) {
    case "UPS":
      return `https://www.ups.com/track?tracknum=${n}`;
    case "FedEx":
      return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case "USPS":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    case "DHL":
      return `https://www.dhl.com/us-en/home/tracking/tracking-express.html?tracking-id=${n}`;
    default:
      return null;
  }
}

/** Best guess at the carrier from the number's shape, so typing a number fills the carrier. */
export function guessCarrier(number: string): Tracking["carrier"] | null {
  const n = number.replace(/\s+/g, "").toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(n)) return "UPS";
  if (/^(94|93|92|95)\d{18,20}$/.test(n)) return "USPS";
  if (/^\d{12}$|^\d{15}$/.test(n)) return "FedEx";
  if (/^\d{10}$|^JD\d{18}$/.test(n)) return "DHL";
  return null;
}
