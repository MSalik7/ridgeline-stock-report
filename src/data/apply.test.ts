import { describe, expect, it } from "vitest";
import { createOrder, deleteOrder, recordArrival, recordChase, setOrderState } from "@/domain/mutations";
import type { AppState, ChangeSet } from "@/domain/types";
import { applyChanges, inverseOf } from "./apply";
import { buildDemoState } from "./demo";

const now = new Date("2026-11-05T16:30:00Z");
const actor = { role: "staff" as const };

function roundTrip(state: AppState, changes: ChangeSet) {
  const after = applyChanges(state, changes);
  const undone = applyChanges(after, inverseOf(state, changes));
  return { after, undone };
}

const sorted = (s: AppState) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(s).map(([k, v]) => [k, Array.isArray(v) ? [...v].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : v]),
    ),
  );

describe("undo puts back exactly what an action changed", () => {
  const state = buildDemoState(now);

  it("placing an order (new order + product counter)", () => {
    const { changes } = createOrder(state, { productId: "grd", supplierId: "taichung", units: 500, notes: "", orderedOn: "2026-11-05" }, actor, now);
    const { after, undone } = roundTrip(state, changes);
    expect(after.orders.length).toBe(state.orders.length + 1);
    expect(sorted(undone)).toBe(sorted(state));
  });

  it("deleting an order that arrivals point at", () => {
    const { after, undone } = roundTrip(state, deleteOrder(state, "o-flt6", actor, now));
    expect(after.orders.some((o) => o.id === "o-flt6")).toBe(false);
    expect(sorted(undone)).toBe(sorted(state));
  });

  it("recording an arrival, closing an order, sending a follow-up", () => {
    for (const changes of [
      recordArrival(state, { productId: "flt", units: 500, receivedOn: "2026-11-05", note: "" }, actor, now).changes,
      setOrderState(state, "o-ktl7", "closed", actor, now),
      recordChase(state, "o-cbj3", "whereabouts", { to: ["a@example.com"], subject: "s", body: "b" }, actor, now),
    ]) {
      expect(sorted(roundTrip(state, changes).undone)).toBe(sorted(state));
    }
  });
});
