import { describe, expect, it } from "vitest";
import { applyChanges, inverseOf } from "@/data/apply";
import { buildDemoState } from "@/data/demo";
import { deleteArrival, editArrival } from "./mutations";
import { buildReport } from "./report";
import { supplierScores } from "./suppliers";

const now = new Date("2026-11-05T16:30:00Z");
const actor = { role: "staff" as const };
const state = buildDemoState(now);

describe("editing and deleting arrivals", () => {
  it("fewer units than matched trims the newest order first, and says so", () => {
    // ARR-0005: 550 units, KTL-005 200 (older) + KTL-006 350 (newer)
    const c = editArrival(state, "a5", { units: 500, receivedOn: state.arrivals.find((a) => a.id === "a5")!.receivedOn, note: "Recount" }, actor, now);
    const a = c.put[0].data as (typeof state.arrivals)[number];
    expect(a.allocations).toEqual([
      { orderId: "o-ktl5", units: 200 },
      { orderId: "o-ktl6", units: 300 },
    ]);
    expect(a.history.at(-1)?.detail).toMatch(/units 550 → 500.*Match trimmed: KTL-006 −50/);
  });
  it("more units than matched leaves the extra unmatched", () => {
    const a7 = state.arrivals.find((a) => a.id === "a6")!;
    const c = editArrival(state, "a6", { units: 750, receivedOn: a7.receivedOn, note: "" }, actor, now);
    const r = buildReport(applyChanges(state, c), now);
    expect(r.unmatchedArrivals.find((u) => u.arrival.id === "a6")?.units).toBe(50);
  });
  it("rejects a date in the future", () => {
    expect(() => editArrival(state, "a6", { units: 700, receivedOn: "2026-12-01", note: "" }, actor, now)).toThrow(/future/);
  });
  it("deleting an arrival puts its units back on the order, notes it there, and can be undone", () => {
    const c = deleteArrival(state, "a6", actor, now);
    const after = applyChanges(state, c);
    const flt6 = buildReport(after, now).orderById.get("o-flt6")!;
    expect(flt6.progress.arrived).toBe(0);
    expect(after.orders.find((o) => o.id === "o-flt6")!.history.at(-1)?.action).toBe("Arrival deleted");
    expect(applyChanges(after, inverseOf(state, c)).arrivals).toHaveLength(state.arrivals.length);
  });
});

describe("supplier scorecard on the demo business", () => {
  const scores = supplierScores(state, buildReport(state, now));
  const by = (id: string) => scores.find((s) => s.supplier.id === id)!;

  it("Taichung took 45 days against a 35-day setting: late, with a lead-time hint", () => {
    const t = by("taichung");
    expect(t.leadDays).toBe(45);
    expect(t.onTimeRate).toBe(0);
    expect(t.verdict.tone).toBe("bad");
    expect(t.hints).toEqual([expect.objectContaining({ setting: 35, actual: 45 })]);
  });
  it("Clayworks shipped 40 of 500 short", () => {
    const c = by("clayworks");
    expect(c.shortUnits).toBe(40);
    expect(c.shortRate).toBeCloseTo(0.08);
    expect(c.verdict.label).toBe("Ships short");
  });
  it("Foshan has a late shipment right now (CBJ-003)", () => {
    expect(by("foshan").lateNow).toBe(1);
    expect(by("foshan").verdict.label).toBe("Late shipment now");
  });
  it("Kawa is reliable: both deliveries inside lead time", () => {
    expect(by("kawa").onTimeRate).toBe(1);
    expect(by("kawa").verdict.label).toBe("Reliable");
  });
});
