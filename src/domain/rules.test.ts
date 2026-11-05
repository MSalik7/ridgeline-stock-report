/**
 * Checks every number in SOP section 4 against hand-worked examples.
 * Each expected value is written out the way it was worked on paper.
 */
import { describe, expect, it } from "vitest";
import { autoMatch, openCapacities } from "./arrivals";
import { addDays, daysBetween } from "./dates";
import { computeForecast, round1, tryOrderDays, type ForecastInput } from "./forecast";
import { chaseAlerts, orderProgress, orderStatus, type OrderProgress } from "./orders";
import { addTracking, createOrder, deleteOrder, logStockChange, recordArrival, setOrderState } from "./mutations";
import { unitsSoldByDay, unshippedUnits } from "./sales";
import { stockLedger, warehouseStock } from "./stock";
import { buildReport } from "./report";
import type { AppState, Product, SupplierOrder } from "./types";

const TODAY = "2026-11-05";
const settings = { leadTimeDays: 45, safetyDays: 14, targetDays: 60 };

/** Units for the 7 completed days before TODAY, oldest first: Oct 29 .. Nov 4. */
function input(units7: number[], extra: Partial<ForecastInput> = {}): ForecastInput {
  const byDay = new Map(units7.map((u, i) => [addDays(TODAY, i - 7), u]));
  return {
    today: TODAY,
    unitsOn: (d) => byDay.get(d) ?? 0,
    stock: 500,
    placed: 0,
    inProduction: 0,
    onTheWay: 0,
    settings,
    ...extra,
  };
}

describe("sales speed and forecast", () => {
  // prior 4 days (Oct 29 - Nov 1): 10+10+10+10 = 40; last 3 (Nov 2-4): 14+14+14 = 42
  const f = computeForecast(input([10, 10, 10, 10, 14, 14, 14], { placed: 100, inProduction: 200, onTheWay: 150 }));

  it("uses the 7 completed store days before today", () => {
    expect(f.window).toEqual({ from: "2026-10-29", to: "2026-11-04" });
  });
  it("sold 7 days = 82, daily burn = 82 / 7", () => {
    expect(f.sold7).toBe(82);
    expect(f.dailyBurn).toBeCloseTo(11.7143, 4);
  });
  it("trend = (42 / 3) / (40 / 4) = 14 / 10 = 1.4", () => {
    expect(f.trendFactor).toBeCloseTo(1.4, 10);
  });
  it("adjusted burn = 11.714 x 1.4 = 16.4, rounded to 1 decimal", () => {
    expect(f.adjustedBurn).toBe(16.4);
  });
  it("days of stock = 500 / 16.4 = 30.49", () => {
    expect(f.daysOfStock).toBeCloseTo(30.4878, 3);
  });
  it("days with everything ordered = (500 + 100 + 200 + 150) / 16.4 = 57.93", () => {
    expect(f.onOrder).toBe(450);
    expect(f.daysWithOrdered).toBeCloseTo(57.9268, 3);
  });
  it("sells out on = Nov 5 + 30 days = Dec 5", () => {
    expect(f.sellsOutOn).toBe("2026-12-05");
  });
  it("reorder by = Nov 5 + floor(30.49 - 45 - 14 = -28.51) = Nov 5 - 29 = Oct 7", () => {
    expect(f.reorderBy).toBe("2026-10-07");
  });
  it("suggested order = (60 + 45) x 16.4 - 500 = 1222", () => {
    expect(f.suggestedOrder).toBe(1222);
  });
  it("try an order of 300 = (500 + 450 + 300) / 16.4 = 76.22 days", () => {
    expect(tryOrderDays(f, 300)).toBeCloseTo(76.2195, 3);
  });
  it("flags reorder now even with 450 on order (57.9 < 45 + 14), and low-watch (21 <= 30.5 < 45)", () => {
    expect(f.flags.reorderNow).toBe(true);
    expect(f.flags.orderedNotEnough).toBe(true);
    expect(f.flags.low).toBe("watch");
    expect(f.flags.outOfStock).toBe(false);
    expect(f.status).toBe("reorder");
  });

  it("caps the trend at 2: prior 4 = 2 units (0.5/day), last 3 = 9 (3/day), ratio 6", () => {
    const g = computeForecast(input([1, 0, 0, 1, 3, 3, 3]));
    expect(g.rawTrend).toBeCloseTo(6, 10);
    expect(g.trendFactor).toBe(2);
    // daily burn 11/7 = 1.571 x 2 = 3.14 -> 3.1
    expect(g.adjustedBurn).toBe(3.1);
  });
  it("floors the trend at 0.5: nothing sold in the last 3 days", () => {
    const g = computeForecast(input([8, 8, 8, 8, 0, 0, 0]));
    expect(g.trendFactor).toBe(0.5);
    // 32/7 = 4.571 x 0.5 = 2.29 -> 2.3
    expect(g.adjustedBurn).toBe(2.3);
  });
  it("uses trend 1 when the prior 4 days had no sales", () => {
    const g = computeForecast(input([0, 0, 0, 0, 7, 7, 7]));
    expect(g.rawTrend).toBeNull();
    expect(g.trendFactor).toBe(1);
    expect(g.adjustedBurn).toBe(3); // 21 / 7
  });
  it("leaves days blank when adjusted burn is 0", () => {
    const g = computeForecast(input([0, 0, 0, 0, 0, 0, 0]));
    expect(g.adjustedBurn).toBe(0);
    expect(g.daysOfStock).toBeNull();
    expect(g.daysWithOrdered).toBeNull();
    expect(g.sellsOutOn).toBeNull();
    expect(g.reorderBy).toBeNull();
    expect(g.suggestedOrder).toBe(0);
    expect(g.flags.reorderNow).toBe(false);
    expect(g.status).toBe("no_sales");
  });
  it("flags out of stock at 0 units, with 0 days left", () => {
    const g = computeForecast(input([5, 5, 5, 5, 5, 5, 5], { stock: 0 }));
    expect(g.flags.outOfStock).toBe(true);
    expect(g.daysOfStock).toBe(0);
    expect(g.sellsOutOn).toBe(TODAY);
    expect(g.suggestedOrder).toBe(525); // (60 + 45) x 5 - 0
    expect(g.status).toBe("out");
  });
  it("low is urgent under 21 days", () => {
    const g = computeForecast(input([10, 10, 10, 10, 10, 10, 10], { stock: 200, onTheWay: 600 }));
    expect(g.daysOfStock).toBe(20);
    expect(g.flags.low).toBe("urgent");
    expect(g.flags.reorderNow).toBe(false); // 800 / 10 = 80 days with everything ordered
    expect(g.status).toBe("urgent");
  });
  it("never suggests a negative order", () => {
    const g = computeForecast(input([1, 1, 1, 1, 1, 1, 1], { stock: 5000 }));
    expect(g.suggestedOrder).toBe(0);
  });
  it("respects per-product settings", () => {
    const g = computeForecast(input([10, 10, 10, 10, 10, 10, 10], { stock: 400, settings: { leadTimeDays: 20, safetyDays: 7, targetDays: 30 } }));
    expect(g.reorderLine).toBe(27);
    expect(g.flags.reorderNow).toBe(false); // 40 days >= 27
    expect(g.reorderBy).toBe(addDays(TODAY, 13)); // 40 - 20 - 7
    expect(g.suggestedOrder).toBe(100); // (30 + 20) x 10 - 400
  });
  it("rounds to 1 decimal without float drift", () => {
    expect(round1(0.35)).toBe(0.4);
    expect(round1(2.25)).toBe(2.3);
    expect(round1(16.39999)).toBe(16.4);
  });
});

// ------------------------------------------------------------------ orders

function order(over: Partial<SupplierOrder> = {}): SupplierOrder {
  return {
    id: "o1",
    name: "GRD-001",
    productId: "p1",
    supplierId: "s1",
    units: 300,
    notes: "",
    orderedOn: "2026-10-01",
    confirmedOn: null,
    tracking: [],
    state: "open",
    chasedAt: {},
    createdAt: "2026-10-01T15:00:00.000Z",
    history: [],
    ...over,
  };
}
const track = (units: number, shippedOn: string, number = `1Z${units}${shippedOn}`) => ({
  id: number,
  number,
  carrier: "UPS" as const,
  units,
  shippedOn,
  addedAt: `${shippedOn}T18:00:00.000Z`,
});

describe("order stages", () => {
  it("unconfirmed order: all units placed", () => {
    const o = order();
    const p = orderProgress(o, undefined);
    expect(p).toMatchObject({ placed: 300, inProduction: 0, onTheWay: 0, confirmed: false });
    expect(orderStatus(o, p)).toBe("placed");
  });
  it("marked confirmed: all units in production", () => {
    const o = order({ confirmedOn: "2026-10-03" });
    const p = orderProgress(o, undefined);
    expect(p).toMatchObject({ placed: 0, inProduction: 300, onTheWay: 0 });
    expect(orderStatus(o, p)).toBe("in_production");
  });
  it("tracking alone counts as confirmed; tracked units are on the way", () => {
    const o = order({ tracking: [track(120, "2026-10-20")] });
    const p = orderProgress(o, undefined);
    expect(p).toMatchObject({ confirmed: true, confirmedOn: "2026-10-20", inProduction: 180, onTheWay: 120 });
    expect(orderStatus(o, p)).toBe("on_the_way");
  });
  it("an arrival alone counts as confirmed", () => {
    const p = orderProgress(order(), { units: 10, firstOn: "2026-10-25" });
    expect(p.confirmed).toBe(true);
    expect(p.confirmedOn).toBe("2026-10-25");
  });
  it("partial: 300 ordered, 120 tracked, 50 arrived -> 70 on the way, 180 in production", () => {
    const o = order({ confirmedOn: "2026-10-03", tracking: [track(120, "2026-10-20")] });
    const p = orderProgress(o, { units: 50, firstOn: "2026-10-28" });
    expect(p).toMatchObject({ remaining: 250, onTheWay: 70, inProduction: 180, placed: 0 });
    expect(orderStatus(o, p)).toBe("partial");
  });
  it("received when nothing is left to come", () => {
    const o = order({ confirmedOn: "2026-10-03" });
    expect(orderStatus(o, orderProgress(o, { units: 300, firstOn: "2026-10-28" }))).toBe("received");
  });
  it("cancelled and closed win over everything else", () => {
    const p = orderProgress(order(), { units: 300, firstOn: "2026-10-28" });
    expect(orderStatus(order({ state: "closed" }), p)).toBe("closed");
    expect(orderStatus(order({ state: "cancelled" }), p)).toBe("cancelled");
  });
});

describe("chase rules", () => {
  const alerts = (o: SupplierOrder, arrived?: { units: number; firstOn: string }) => {
    const p: OrderProgress = orderProgress(o, arrived);
    return chaseAlerts(o, p, orderStatus(o, p), TODAY);
  };

  it("ask to confirm: 2 days after ordering, not 1", () => {
    expect(alerts(order({ orderedOn: "2026-11-03" })).map((a) => a.kind)).toEqual(["confirm"]);
    expect(alerts(order({ orderedOn: "2026-11-04" }))).toEqual([]);
  });
  it("ask for tracking: confirmed 10+ days ago with untracked units", () => {
    expect(alerts(order({ confirmedOn: "2026-10-26" })).map((a) => a.kind)).toEqual(["tracking"]);
    expect(alerts(order({ confirmedOn: "2026-10-27" }))).toEqual([]);
    // all units tracked -> nothing to ask for
    expect(alerts(order({ confirmedOn: "2026-10-01", tracking: [track(300, "2026-11-01")] }))).toEqual([]);
  });
  it("ask where it is: on the way MORE than 10 days", () => {
    const late = order({ confirmedOn: "2026-10-01", tracking: [track(300, "2026-10-25")] }); // 11 days
    expect(alerts(late).map((a) => a.kind)).toEqual(["whereabouts"]);
    const onTime = order({ confirmedOn: "2026-10-01", tracking: [track(300, "2026-10-26")] }); // 10 days
    expect(alerts(onTime)).toEqual([]);
  });
  it("arrived units clear the oldest shipment first", () => {
    const o = order({
      confirmedOn: "2026-10-01",
      tracking: [track(100, "2026-10-10", "A"), track(200, "2026-11-01", "B")],
    });
    expect(alerts(o, { units: 100, firstOn: "2026-10-20" })).toEqual([]);
    expect(alerts(o, { units: 50, firstOn: "2026-10-20" }).map((a) => a.kind)).toEqual(["whereabouts"]);
  });
  it("repeats at most every 2 days while the reason applies", () => {
    const base = { orderedOn: "2026-10-30" };
    const yesterday = alerts(order({ ...base, chasedAt: { confirm: "2026-11-04T16:00:00.000Z" } }))[0];
    expect(yesterday.due).toBe(false);
    expect(yesterday.nextDueOn).toBe("2026-11-06");
    const twoDaysAgo = alerts(order({ ...base, chasedAt: { confirm: "2026-11-03T16:00:00.000Z" } }))[0];
    expect(twoDaysAgo.due).toBe(true);
  });
  it("closed or cancelled orders are never chased", () => {
    expect(alerts(order({ orderedOn: "2026-10-01", state: "closed" }))).toEqual([]);
    expect(alerts(order({ orderedOn: "2026-10-01", state: "cancelled" }))).toEqual([]);
  });
});

// ------------------------------------------------------------------ state-level

function product(over: Partial<Product> = {}): Product {
  return {
    id: "p1",
    code: "FLT",
    name: "Filters",
    identifiers: [
      { sku: "FLT-100", label: "Single pack", unitsPerSale: 1 },
      { sku: "FLT-B2G2", label: "Buy 2 get 2", unitsPerSale: 4 },
    ],
    supplierId: "s1",
    forecast: {},
    stockCount: { units: 1000, date: "2026-10-01" },
    nextOrderSeq: 1,
    ...over,
  };
}

function state(over: Partial<AppState> = {}): AppState {
  return {
    settings: {
      storeName: "Test",
      forecast: settings,
      staleAfterHours: 24,
      reorderEmails: { enabled: false, recipients: [] },
    },
    feed: { salesSyncedAt: null, stockSyncedAt: null },
    products: [product()],
    suppliers: [{ id: "s1", name: "Supplier", contact: "", email: "s@example.com" }],
    orders: [],
    arrivals: [],
    stockChanges: [],
    sales: [],
    outbox: [],
    ...over,
  };
}

const actor = { role: "staff" as const };
const NOW = new Date("2026-11-05T17:00:00.000Z"); // 10 AM in Denver

describe("bundles and shipping", () => {
  const sales = [
    { date: "2026-11-03", sold: { "FLT-100": 3, "FLT-B2G2": 2 }, shipped: { "FLT-100": 3, "FLT-B2G2": 2 } },
    { date: "2026-11-04", sold: { "FLT-100": 10, "FLT-B2G2": 10 }, shipped: { "FLT-100": 6, "FLT-B2G2": 7 } },
  ];
  it("a buy-2-get-2 sale takes 4 units: 3 + 2 x 4 = 11", () => {
    expect(unitsSoldByDay(sales, product()).get("2026-11-03")).toBe(11);
  });
  it("sold but not shipped counts bundles too: (10 - 6) + (10 - 7) x 4 = 16", () => {
    expect(unshippedUnits(sales, product())).toBe(16);
  });
  it("warehouse stock = count + arrivals + changes - shipped", () => {
    const s = state({ sales });
    const withArrival = recordArrival(s, { productId: "p1", units: 50, receivedOn: "2026-10-05", note: "" }, actor, NOW);
    s.arrivals.push(withArrival.arrival);
    const adj = logStockChange(s, { productId: "p1", kind: "adjustment", units: -4, note: "Damaged", on: "2026-11-01" }, actor, NOW);
    s.stockChanges.push(adj.put[0].data as never);
    const sale = logStockChange(s, { productId: "p1", kind: "manual_sale", units: 6, note: "Cafe wholesale", on: "2026-11-04" }, actor, NOW);
    s.stockChanges.push(sale.put[0].data as never);
    // 1000 + 50 - 4 - 6 - 11 (Nov 3) - (6 + 28) (Nov 4) = 995
    expect(warehouseStock(s, s.products[0])).toBe(995);
    const ledger = stockLedger(s, s.products[0]);
    expect(ledger.map((l) => l.kind)).toEqual(["count", "arrival", "adjustment", "shipped", "manual_sale", "shipped"]);
    // the manual sale counts toward sales speed but never as unshipped
    expect(unitsSoldByDay(s.sales, s.products[0], s.stockChanges).get("2026-11-04")).toBe(10 + 40 + 6);
    expect(unshippedUnits(s.sales, s.products[0])).toBe(16);
  });
});

describe("arrivals", () => {
  it("fills the oldest open order first and spills into the next", () => {
    const s = state({
      orders: [
        order({ id: "new", name: "FLT-002", productId: "p1", units: 100, orderedOn: "2026-10-10" }),
        order({ id: "old", name: "FLT-001", productId: "p1", units: 50, orderedOn: "2026-09-10" }),
        order({ id: "done", name: "FLT-000", productId: "p1", units: 80, orderedOn: "2026-08-10", state: "closed" }),
      ],
    });
    expect(autoMatch(120, openCapacities(s, "p1"))).toEqual([
      { orderId: "old", units: 50 },
      { orderId: "new", units: 70 },
    ]);
    // more than all open orders can take: the rest stays unmatched
    const a = recordArrival(s, { productId: "p1", units: 200, receivedOn: TODAY, note: "" }, actor, NOW).arrival;
    expect(a.allocations).toEqual([
      { orderId: "old", units: 50 },
      { orderId: "new", units: 100 },
    ]);
    expect(buildReport({ ...s, arrivals: [a] }, NOW).unmatchedArrivals[0].units).toBe(50);
  });
  it("hand matching can't give an order more than it has left", () => {
    const s = state({ orders: [order({ id: "old", productId: "p1", units: 50 })] });
    expect(() =>
      recordArrival(s, { productId: "p1", units: 80, receivedOn: TODAY, note: "", allocations: [{ orderId: "old", units: 60 }] }, actor, NOW),
    ).toThrow(/only take 50/);
  });
  it("deleting an order frees its matched units", () => {
    const s = state({ orders: [order({ id: "old", productId: "p1", units: 50 })] });
    s.arrivals.push(recordArrival(s, { productId: "p1", units: 50, receivedOn: TODAY, note: "" }, actor, NOW).arrival);
    const c = deleteOrder(s, "old", actor, NOW);
    expect((c.put[0].data as { allocations: unknown[] }).allocations).toEqual([]);
  });
});

describe("order actions", () => {
  it("names orders by product code and number, never reusing one", () => {
    const s = state({ products: [product({ nextOrderSeq: 4 })] });
    const { order: o } = createOrder(s, { productId: "p1", supplierId: "s1", units: 10, notes: "", orderedOn: TODAY }, actor, NOW);
    expect(o.name).toBe("FLT-004");
  });
  it("tracking can't add up to more than the order", () => {
    const s = state({ orders: [order({ productId: "p1", units: 100, tracking: [track(60, "2026-11-01")] })] });
    expect(() => addTracking(s, "o1", [{ number: "X1", carrier: "UPS", units: 50, shippedOn: TODAY }], actor, NOW)).toThrow(/40 units can still/);
    expect(() => addTracking(s, "o1", [{ number: "X1", carrier: "UPS", units: 40, shippedOn: TODAY }], actor, NOW)).not.toThrow();
  });
  it("an order with arrivals can be closed but not cancelled", () => {
    const s = state({ orders: [order({ id: "o1", productId: "p1", units: 50 })] });
    s.arrivals.push(recordArrival(s, { productId: "p1", units: 20, receivedOn: TODAY, note: "" }, actor, NOW).arrival);
    expect(() => setOrderState(s, "o1", "cancelled", actor, NOW)).toThrow(/Close the order instead/);
    expect(() => setOrderState(s, "o1", "closed", actor, NOW)).not.toThrow();
  });
  it("only open orders count toward stock numbers", () => {
    const s = state({
      orders: [order({ id: "a", productId: "p1", units: 100 }), order({ id: "b", productId: "p1", units: 70, state: "closed" })],
    });
    const row = buildReport(s, NOW).products[0];
    expect(row.placed).toBe(100);
  });
});

describe("store time", () => {
  it("counts days in America/Denver", () => {
    // 2026-11-06 05:00 UTC is still Nov 5 in Denver (10 PM MST)
    const late = buildReport(state(), new Date("2026-11-06T05:00:00.000Z"));
    expect(late.today).toBe("2026-11-05");
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2); // across the DST change on Nov 1
  });
});
