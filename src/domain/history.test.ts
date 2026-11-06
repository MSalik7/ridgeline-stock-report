import { describe, expect, it } from "vitest";
import { buildDemoState } from "@/data/demo";
import { applyChanges } from "@/data/apply";
import { openCapacities } from "./arrivals";
import { rematchArrival } from "./mutations";
import { LEDGER_LABEL, stockLedger, warehouseStock } from "./stock";

const now = new Date("2026-11-05T16:30:00Z");
const actor = { role: "staff" as const };

describe("stock history: moves between orders (SOP section 3)", () => {
  it("records a changed match with what moved, when and who, without changing stock", () => {
    const s = buildDemoState(now);
    // An arrival matched to one order, and another open order of the same product with room.
    let move: { arrivalId: string; from: string; to: string; units: number } | null = null;
    for (const a of s.arrivals) {
      const from = a.allocations.find((al) => al.orderId && al.units > 0);
      if (!from) continue;
      const to = openCapacities(s, a.productId, a.id).find((c) => c.order.id !== from.orderId && c.capacity > 0);
      if (to) {
        move = { arrivalId: a.id, from: from.orderId!, to: to.order.id, units: Math.min(from.units, to.capacity) };
        break;
      }
    }
    expect(move).not.toBeNull();
    const { arrivalId, from, to, units } = move!;
    const arrival = s.arrivals.find((a) => a.id === arrivalId)!;
    const product = s.products.find((p) => p.id === arrival.productId)!;

    const allocations = arrival.allocations.map((al) => (al.orderId === from ? { ...al, units: al.units - units } : al));
    allocations.push({ orderId: to, units });
    const after = applyChanges(s, rematchArrival(s, arrivalId, allocations, actor, now));

    const moved = stockLedger(after, product).filter((e) => e.kind === "rematch");
    expect(moved).toHaveLength(1);
    expect(LEDGER_LABEL[moved[0].kind]).toBe("Moved between orders");
    expect(moved[0].change).toBe(0);
    expect(moved[0].why).toContain(arrival.name);
    expect(moved[0].why).toContain("→");
    expect(moved[0].actor).toEqual(actor);
    expect(moved[0].at).toBe(now.toISOString());
    expect(warehouseStock(after, product)).toBe(warehouseStock(s, product));
  });
});
