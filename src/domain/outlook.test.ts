import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { computeForecast } from "./forecast";
import { buildOutlook, incomingForOrder, type Incoming } from "./outlook";
import { orderProgress } from "./orders";
import { todayActions } from "./actions";
import { buildReport } from "./report";
import { buildDemoState } from "@/data/demo";
import type { SupplierOrder } from "./types";

const TODAY = "2026-11-04";
const order = (over: Partial<SupplierOrder>): SupplierOrder => ({
  id: "o1",
  name: "GRD-004",
  productId: "p",
  supplierId: "s",
  units: 300,
  notes: "",
  orderedOn: "2026-11-03",
  confirmedOn: null,
  tracking: [],
  state: "open",
  chasedAt: {},
  createdAt: "2026-11-03T16:00:00Z",
  history: [],
  ...over,
});
const inc = (units: number, k: number, late = false): Incoming => ({
  orderId: `o${k}`,
  orderName: `X-${k}`,
  units,
  expectedOn: addDays(TODAY, k),
  basis: "lead time",
  late,
  daysLate: late ? -k : 0,
});

describe("expected arrivals", () => {
  it("untracked units: order date + lead time (Nov 3 + 35 = Dec 8)", () => {
    const o = order({});
    const [i] = incomingForOrder(o, orderProgress(o, undefined), 35, TODAY);
    expect(i).toMatchObject({ units: 300, expectedOn: "2026-12-08", basis: "lead time", late: false });
  });
  it("tracked units: ship date + 10 days transit, late once that passes", () => {
    const o = order({
      orderedOn: "2026-09-20",
      confirmedOn: "2026-09-22",
      tracking: [{ id: "t", number: "1Z", carrier: "UPS", units: 400, shippedOn: "2026-10-21", addedAt: "2026-10-21T20:00:00Z" }],
      units: 400,
    });
    const [i] = incomingForOrder(o, orderProgress(o, undefined), 45, TODAY);
    expect(i).toMatchObject({ units: 400, expectedOn: "2026-10-31", basis: "tracking", late: true, daysLate: 4 });
  });
  it("splits an order into its tracked and untracked parts", () => {
    const o = order({
      confirmedOn: "2026-11-03",
      tracking: [{ id: "t", number: "1Z", carrier: "UPS", units: 100, shippedOn: "2026-11-04", addedAt: "2026-11-04T20:00:00Z" }],
    });
    const parts = incomingForOrder(o, orderProgress(o, undefined), 35, TODAY);
    expect(parts.map((p) => [p.units, p.expectedOn])).toEqual([
      [100, "2026-11-14"],
      [200, "2026-12-08"],
    ]);
  });
});

describe("stock projection", () => {
  it("runs out on the same day as the SOP's 'sells out on' (170 / 19.7 = 8.63 -> Nov 12)", () => {
    const o = buildOutlook({ stock: 170, burn: 19.7, incoming: [inc(300, 34)], today: TODAY, minHorizon: 49 });
    const f = computeForecast({
      today: TODAY,
      unitsOn: () => 19.7,
      stock: 170,
      placed: 300,
      inProduction: 0,
      onTheWay: 0,
      settings: { leadTimeDays: 35, safetyDays: 14, targetDays: 60 },
    });
    expect(o.runsOutOn).toBe(f.sellsOutOn);
    expect(o.gaps[0]).toEqual({ from: "2026-11-12", to: "2026-12-08", days: 26 });
    expect(o.nextStock?.orderName).toBe("X-34");
  });
  it("an arrival before stock runs out means no gap", () => {
    const o = buildOutlook({ stock: 100, burn: 10, incoming: [inc(500, 5)], today: TODAY, minHorizon: 40 });
    // 600 units at 10 a day lasts until day 59, past the 40-day horizon floor? horizon = max(40, 5+14, 30) = 40
    expect(o.gaps).toEqual([]);
  });
  it("out of stock with only a late shipment: gap from today, late shipment is next stock", () => {
    const o = buildOutlook({ stock: 0, burn: 1.7, incoming: [inc(400, -4, true)], today: TODAY, minHorizon: 59 });
    expect(o.runsOutOn).toBe(TODAY);
    expect(o.gaps[0].to).toBeNull();
    expect(o.nextStock?.late).toBe(true);
  });
  it("no sales means no gap", () => {
    expect(buildOutlook({ stock: 0, burn: 0, incoming: [], today: TODAY, minHorizon: 30 }).gaps).toEqual([]);
  });
});

describe("today's to-do list on the demo business", () => {
  const now = new Date("2026-11-05T16:30:00Z");
  const report = buildReport(buildDemoState(now), now);
  const actions = todayActions(report);

  it("puts the grinder reorder first: it runs out weeks before the open order lands", () => {
    expect(actions[0]).toMatchObject({ kind: "reorder", severity: "critical", title: "Reorder Hand Burr Grinder" });
    expect(actions[0].detail).toMatch(/Runs out .*GRD-004 lands/);
  });
  it("marks the cold brew follow-up critical: the jar is out and that shipment is the next stock", () => {
    const cbj = actions.find((a) => a.kind === "chase" && a.title.includes("CBJ-003"));
    expect(cbj?.severity).toBe("critical");
    expect(cbj?.detail).toMatch(/out of stock and this is the next stock/);
  });
  it("lists every due follow-up and the unmatched arrival, and nothing twice", () => {
    expect(actions.filter((a) => a.kind === "chase")).toHaveLength(report.chaseDue.length);
    expect(actions.some((a) => a.kind === "match")).toBe(true);
    expect(new Set(actions.map((a) => a.key)).size).toBe(actions.length);
  });
});
