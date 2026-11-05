import { arrivalsByOrder, isOpenStatus, orderProgress, orderStatus } from "./orders";
import type { Allocation, AppState, Arrival, SupplierOrder } from "./types";

export interface OrderCapacity {
  order: SupplierOrder;
  /** Units this order can still take. */
  capacity: number;
}

/**
 * Open orders for a product that can still receive units, oldest first.
 * `excludeArrivalId` leaves one arrival's own allocations out, for re-matching it.
 */
export function openCapacities(
  state: Pick<AppState, "orders" | "arrivals">,
  productId: string,
  excludeArrivalId?: string,
): OrderCapacity[] {
  const others = excludeArrivalId ? state.arrivals.filter((a) => a.id !== excludeArrivalId) : state.arrivals;
  const arrived = arrivalsByOrder(others);
  return state.orders
    .filter((o) => o.productId === productId)
    .map((order) => {
      const p = orderProgress(order, arrived.get(order.id));
      return { order, capacity: isOpenStatus(orderStatus(order, p)) ? p.remaining : 0 };
    })
    .filter((c) => c.capacity > 0)
    .sort(
      (a, b) =>
        a.order.orderedOn.localeCompare(b.order.orderedOn) ||
        a.order.createdAt.localeCompare(b.order.createdAt) ||
        a.order.name.localeCompare(b.order.name),
    );
}

/** Oldest open order first, spilling into the next; whatever is left stays unmatched. */
export function autoMatch(units: number, capacities: OrderCapacity[]): Allocation[] {
  let left = units;
  const out: Allocation[] = [];
  for (const c of capacities) {
    if (left <= 0) break;
    const take = Math.min(left, c.capacity);
    if (take > 0) {
      out.push({ orderId: c.order.id, units: take });
      left -= take;
    }
  }
  return out;
}

export function allocatedUnits(a: Pick<Arrival, "allocations">): number {
  return a.allocations.reduce((s, al) => s + al.units, 0);
}

/** Units nobody has assigned yet: these need someone to deal with them. */
export function unmatchedUnits(a: Pick<Arrival, "allocations" | "units">): number {
  return Math.max(0, a.units - allocatedUnits(a));
}

/** Checks a hand-made match. Returns a message saying what to fix, or null. */
export function validateAllocations(
  arrivalUnits: number,
  allocations: Allocation[],
  capacities: Map<string, number>,
  orderNames: Map<string, string>,
): string | null {
  for (const al of allocations) {
    if (!Number.isInteger(al.units) || al.units < 0) return "Units must be whole numbers, 0 or more.";
    if (al.orderId) {
      const cap = capacities.get(al.orderId) ?? 0;
      if (al.units > cap) {
        return `${orderNames.get(al.orderId) ?? "That order"} can only take ${cap} more units.`;
      }
    }
  }
  const total = allocations.reduce((s, a) => s + a.units, 0);
  if (total > arrivalUnits) return `That assigns ${total} units, but only ${arrivalUnits} arrived.`;
  return null;
}

/** Drops zero rows and merges duplicate targets so stored matches stay tidy. */
export function normalizeAllocations(allocations: Allocation[]): Allocation[] {
  const map = new Map<string | null, number>();
  for (const a of allocations) {
    if (a.units > 0) map.set(a.orderId, (map.get(a.orderId) ?? 0) + a.units);
  }
  return [...map].map(([orderId, units]) => ({ orderId, units }));
}
