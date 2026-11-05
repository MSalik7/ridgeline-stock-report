/**
 * Money, batch reorders, purchase orders and the activity feed.
 * Expected values are worked by hand in the comments.
 */
import { describe, expect, it } from "vitest";
import { buildDemoState } from "@/data/demo";
import { activityFeed, unread } from "./activity";
import { batchOrderMessage } from "./messages";
import { buildMoney, orderUnitCost } from "./money";
import { ActionError, createOrder, createOrders, recordBatchMessage, saveProduct } from "./mutations";
import { purchaseOrder } from "./po";
import { reorderPlan } from "./reorder";
import { buildReport } from "./report";
import type { AppState, Product, SalesDay, SupplierOrder } from "./types";

const NOW = new Date("2026-11-05T17:00:00.000Z"); // 10 AM in Denver
const actor = { role: "staff" as const };

function product(over: Partial<Product> = {}): Product {
  return {
    id: "p1",
    code: "GRD",
    name: "Grinder",
    identifiers: [{ sku: "GRD-1", label: "Single", unitsPerSale: 1 }],
    supplierId: "s1",
    forecast: {},
    stockCount: { units: 100, date: "2026-10-01" },
    nextOrderSeq: 1,
    unitCost: 20,
    ...over,
  };
}

function order(over: Partial<SupplierOrder> = {}): SupplierOrder {
  return {
    id: "o1",
    name: "GRD-001",
    productId: "p1",
    supplierId: "s1",
    units: 50,
    notes: "",
    orderedOn: "2026-11-01",
    confirmedOn: null,
    tracking: [],
    state: "open",
    chasedAt: {},
    createdAt: "2026-11-01T16:00:00.000Z",
    history: [],
    ...over,
  };
}

/** `perDay` units sold and shipped every day for the 14 days before Nov 5. */
function steadySales(sku: string, perDay: number): SalesDay[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 10, 5 - 14 + i, 12)).toISOString().slice(0, 10);
    return { date: d, sold: { [sku]: perDay }, shipped: { [sku]: perDay } };
  });
}

function state(over: Partial<AppState> = {}): AppState {
  return {
    settings: {
      storeName: "Test Store",
      forecast: { leadTimeDays: 45, safetyDays: 14, targetDays: 60 },
      staleAfterHours: 24,
      reorderEmails: { enabled: false, recipients: [] },
    },
    feed: { salesSyncedAt: null, stockSyncedAt: null },
    products: [product()],
    suppliers: [{ id: "s1", name: "Acme Steel Works", contact: "Ann Lee", email: "acme@example.com" }],
    orders: [],
    arrivals: [],
    stockChanges: [],
    sales: [],
    outbox: [],
    ...over,
  };
}

describe("money", () => {
  it("stock value is warehouse units x unit cost", () => {
    // count 100 on Oct 1, no sales -> 100 units x $20 = $2,000
    const m = buildMoney(buildReport(state(), NOW));
    expect(m.stockValue).toBe(2000);
    expect(m.stockUnits).toBe(100);
  });

  it("an order keeps the price it was placed at", () => {
    expect(orderUnitCost({ unitCost: 18 }, { unitCost: 20 })).toBe(18);
    expect(orderUnitCost({}, { unitCost: 20 })).toBe(20);
    expect(orderUnitCost({}, {})).toBeNull();
    // 50 placed at $18 -> $900 on order, even though the product now costs $20
    const m = buildMoney(buildReport(state({ orders: [order({ unitCost: 18 })] }), NOW));
    expect(m.onOrder).toEqual({ placed: 900, inProduction: 0, onTheWay: 0, total: 900 });
    expect(m.suppliers[0]).toMatchObject({ openOrders: 1, committed: 900 });
  });

  it("splits committed cash by stage and ignores cancelled orders", () => {
    const orders = [
      order({ id: "a", name: "GRD-001" }), // 50 placed
      order({ id: "b", name: "GRD-002", confirmedOn: "2026-11-02" }), // 50 in production
      order({ id: "c", name: "GRD-003", confirmedOn: "2026-11-02", tracking: [{ id: "t", number: "1Z1", carrier: "UPS", units: 20, shippedOn: "2026-11-04", addedAt: "2026-11-04T18:00:00.000Z" }] }), // 30 in production, 20 on the way
      order({ id: "d", name: "GRD-004", state: "cancelled" }),
    ];
    const m = buildMoney(buildReport(state({ orders }), NOW));
    // placed 50 x 20 = 1,000; in production (50 + 30) x 20 = 1,600; on the way 20 x 20 = 400
    expect(m.onOrder).toEqual({ placed: 1000, inProduction: 1600, onTheWay: 400, total: 3000 });
  });

  it("over-stock is stock beyond lead + target days of sales", () => {
    // sells 1/day; keep (45 + 60) x 1 = 105; 300 in stock -> 195 extra x $20 = $3,900
    const s = state({ products: [product({ stockCount: { units: 314, date: "2026-10-22" } })], sales: steadySales("GRD-1", 1) });
    const r = buildReport(s, NOW);
    expect(r.products[0].stock).toBe(300);
    const m = buildMoney(r);
    expect(m.excess).toEqual({ products: 1, units: 195, value: 3900 });
  });

  it("products without a cost are listed and left out of totals", () => {
    const m = buildMoney(buildReport(state({ products: [product({ unitCost: undefined })] }), NOW));
    expect(m.missingCost.map((p) => p.id)).toEqual(["p1"]);
    expect(m.stockValue).toBe(0);
  });

  it("the demo business has a cost for every product", () => {
    const demo = buildDemoState(NOW);
    const m = buildMoney(buildReport(demo, NOW));
    expect(m.missingCost).toEqual([]);
    expect(m.stockValue).toBeGreaterThan(0);
    expect(m.onOrder.total).toBeGreaterThan(0);
  });
});

describe("unit cost in setup", () => {
  it("is optional, rounded to cents, never negative", () => {
    const s = state();
    const saved = saveProduct(s, product({ unitCost: 12.345 })).put[0].data as Product;
    expect(saved.unitCost).toBe(12.35);
    expect("unitCost" in (saveProduct(s, product({ unitCost: undefined })).put[0].data as Product)).toBe(false);
    expect(() => saveProduct(s, product({ unitCost: -1 }))).toThrow(ActionError);
  });

  it("a new order copies the product's current cost", () => {
    const { order: o } = createOrder(state(), { productId: "p1", supplierId: "s1", units: 10, notes: "", orderedOn: "2026-11-05" }, actor, NOW);
    expect(o.unitCost).toBe(20);
  });
});

describe("planning reorders", () => {
  // 10/day, nothing on order. Reorder line = 45 + 14 = 59 days.
  const rows = (stock: number, extra: Partial<Product> = {}) =>
    state({ products: [product({ stockCount: { units: stock + 140, date: "2026-10-22" }, ...extra })], sales: steadySales("GRD-1", 10) });

  it("due now when days with everything ordered is under the reorder line", () => {
    // 500 / 10 = 50 days < 59, so it crossed the line 9 days ago: due since Oct 27
    const plan = reorderPlan(buildReport(rows(500), NOW));
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ due: "now", dueOn: "2026-10-27" });
    // suggested = (60 + 45) x 10 - 500 = 550
    expect(plan[0].units).toBe(550);
  });

  it("due soon when it crosses the line within 30 days", () => {
    // 700 / 10 = 70 days; 70 - 59 = 11 days -> due Nov 16
    const plan = reorderPlan(buildReport(rows(700), NOW));
    expect(plan[0]).toMatchObject({ due: "soon", dueOn: "2026-11-16" });
    // 900 / 10 = 90 days; 31 days away -> not in the plan
    expect(reorderPlan(buildReport(rows(900), NOW))).toEqual([]);
  });

  it("places a batch with unique names, one after another", () => {
    const s = state({ products: [product(), product({ id: "p2", code: "KTL", name: "Kettle", identifiers: [{ sku: "KTL-1", label: "Single", unitsPerSale: 1 }] })] });
    const { orders, changes } = createOrders(
      s,
      [
        { productId: "p1", supplierId: "s1", units: 10, notes: "", orderedOn: "2026-11-05" },
        { productId: "p2", supplierId: "s1", units: 20, notes: "", orderedOn: "2026-11-05" },
      ],
      actor,
      NOW,
    );
    expect(orders.map((o) => o.name)).toEqual(["GRD-001", "KTL-001"]);
    expect(changes.put.filter((p) => p.collection === "orders")).toHaveLength(2);
    expect(() => createOrders(s, [], actor, NOW)).toThrow(ActionError);
  });

  it("one batch message notes every order and keeps one outbox copy", () => {
    const s = state({ orders: [order({ id: "a", name: "GRD-001" }), order({ id: "b", name: "GRD-002", units: 70 })] });
    const draft = batchOrderMessage(s.orders, s.products, s.suppliers[0], s.settings, "PO-20261105-ASW");
    expect(draft.subject).toBe("2 orders: GRD-001, GRD-002");
    expect(draft.body).toContain("PO-20261105-ASW");
    const ch = recordBatchMessage(s, ["a", "b"], draft, actor, NOW);
    expect(ch.put.filter((p) => p.collection === "orders")).toHaveLength(2);
    const out = ch.put.filter((p) => p.collection === "outbox");
    expect(out).toHaveLength(1);
    expect(out[0].data).toMatchObject({ orderIds: ["a", "b"], kind: "order" });
  });
});

describe("purchase order", () => {
  it("one order: numbered after it, total = units x cost, due after lead time", () => {
    const s = state({ orders: [order({ unitCost: 18, notes: "Black only" })] });
    const po = purchaseOrder(s, ["o1"])!;
    expect(po.number).toBe("PO-GRD-001");
    expect(po.lines[0]).toMatchObject({ units: 50, unitCost: 18, total: 900, expectedOn: "2026-12-16" }); // Nov 1 + 45
    expect(po.subtotal).toBe(900);
    expect(po.missingCost).toBe(false);
    expect(po.notes).toEqual(["GRD-001: Black only"]);
  });

  it("a batch to one supplier: one document, numbered by date and supplier", () => {
    const s = state({ orders: [order({ id: "a" }), order({ id: "b", name: "GRD-002", orderedOn: "2026-11-05" })] });
    const po = purchaseOrder(s, ["a", "b"])!;
    expect(po.number).toBe("PO-20261105-ASW");
    expect(po.lines).toHaveLength(2);
    expect(po.subtotal).toBe(2000); // 2 x 50 x $20
  });

  it("flags a missing cost instead of inventing one", () => {
    const s = state({ products: [product({ unitCost: undefined })], orders: [order()] });
    const po = purchaseOrder(s, ["o1"])!;
    expect(po.lines[0].total).toBeNull();
    expect(po.missingCost).toBe(true);
  });
});

describe("activity feed", () => {
  const supplierActor = { role: "supplier" as const, supplierId: "s1" };
  const s = state({
    orders: [
      order({
        history: [
          { at: "2026-11-01T16:00:00.000Z", actor, action: "Placed order", detail: "50 units" },
          { at: "2026-11-01T16:00:00.000Z", actor, action: "Sent order to supplier", detail: "acme@example.com" },
          { at: "2026-11-03T20:00:00.000Z", actor: supplierActor, action: "Confirmed order", detail: "In production" },
          { at: "2026-11-04T15:00:00.000Z", actor, action: "Sent follow-up: Ask for tracking", detail: "acme@example.com" },
        ],
      }),
    ],
  });
  const feed = activityFeed(s, buildReport(s, NOW), actor, NOW);

  it("lists what happened, newest first, without the duplicate send line", () => {
    expect(feed.map((f) => f.title)).toEqual(["Followed up on GRD-001", "Acme Steel Works confirmed GRD-001", "Placed GRD-001"]);
    expect(feed[1].kind).toBe("supplier");
  });

  it("only counts other people's actions as new", () => {
    expect(unread(feed, "2026-10-01T00:00:00.000Z").map((f) => f.title)).toEqual(["Acme Steel Works confirmed GRD-001"]);
    expect(unread(feed, "2026-11-04T00:00:00.000Z")).toEqual([]);
  });

  it("a shipment turns late the day after it was due", () => {
    // shipped Oct 20 + 10 days transit = due Oct 30 -> late from Oct 31
    const late = state({ orders: [order({ confirmedOn: "2026-10-02", tracking: [{ id: "t", number: "1Z9", carrier: "UPS", units: 50, shippedOn: "2026-10-20", addedAt: "2026-10-20T18:00:00.000Z" }] })] });
    const f = activityFeed(late, buildReport(late, NOW), actor, NOW).find((x) => x.kind === "late")!;
    expect(f.title).toBe("GRD-001 is late");
    expect(f.at.slice(0, 10)).toBe("2026-10-31");
    expect(f.mine).toBe(false);
  });

  it("notes the day a product ran out", () => {
    // 100 counted Oct 22, 10/day shipped for 14 days from Oct 22 -> hits 0 on Oct 31
    const out = state({ products: [product({ stockCount: { units: 100, date: "2026-10-22" } })], sales: steadySales("GRD-1", 10) });
    const f = activityFeed(out, buildReport(out, NOW), actor, NOW).find((x) => x.kind === "out")!;
    expect(f.title).toBe("Grinder ran out of stock");
    expect(f.at.slice(0, 10)).toBe("2026-10-31");
  });
});
