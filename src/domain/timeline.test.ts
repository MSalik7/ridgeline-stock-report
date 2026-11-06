import { describe, expect, it } from "vitest";
import { buildReport } from "./report";
import { stockTimeline } from "./timeline";
import type { AppState, Product, SalesDay, SupplierOrder } from "./types";

const NOW = new Date("2026-11-05T17:00:00.000Z"); // Nov 5, 10 AM in Denver

const product = (over: Partial<Product> = {}): Product => ({
  id: "p1",
  code: "GRD",
  name: "Grinder",
  identifiers: [{ sku: "GRD-1", label: "Single", unitsPerSale: 1 }],
  supplierId: "s1",
  forecast: {},
  stockCount: { units: 200, date: "2026-10-22" },
  nextOrderSeq: 1,
  ...over,
});

/** 10 sold and shipped every day, Oct 22 – Nov 4. */
const sales: SalesDay[] = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 22 + i, 12)).toISOString().slice(0, 10);
  return { date: d, sold: { "GRD-1": 10 }, shipped: { "GRD-1": 10 } };
});

const state = (orders: SupplierOrder[] = []): AppState => ({
  settings: { storeName: "Test", forecast: { leadTimeDays: 45, safetyDays: 14, targetDays: 60 }, staleAfterHours: 24, reorderEmails: { enabled: false, recipients: [] } },
  feed: { salesSyncedAt: null, stockSyncedAt: null },
  products: [product()],
  suppliers: [{ id: "s1", name: "Supplier", contact: "", email: "s@example.com" }],
  orders,
  arrivals: [],
  stockChanges: [],
  sales,
  outbox: [],
});

const build = (s: AppState) => {
  const r = buildReport(s, NOW);
  return stockTimeline(s, r.products[0], r.today);
};

describe("stock timeline", () => {
  const t = build(state());

  it("has one actual point per day from the count to today", () => {
    expect(t.points[0].date).toBe("2026-10-22");
    expect(t.points[t.todayIndex].date).toBe("2026-11-05");
    expect(t.todayIndex).toBe(14);
    expect(t.points.slice(0, t.todayIndex + 1).every((p) => !p.projected)).toBe(true);
  });

  it("uses the end-of-day balance and carries it over quiet days", () => {
    // 200 counted Oct 22, 10 shipped that day -> 190; Nov 4 -> 200 - 140 = 60; today, nothing shipped yet -> 60
    expect(t.points[0].stock).toBe(190);
    expect(t.points[13].stock).toBe(60);
    expect(t.points[14].stock).toBe(60);
  });

  it("keeps what moved stock each day", () => {
    expect(t.points[0].events.map((e) => [e.kind, e.change])).toEqual([
      ["count", 200],
      ["shipped", -10],
    ]);
    expect(t.points[14].events).toEqual([]);
  });

  it("projects after today and marks days without enough stock", () => {
    // burn 10/day from 60: after today 50, Nov 6 40 ... Nov 10 0, then short from Nov 11
    const nov6 = t.points[15];
    expect(nov6).toMatchObject({ date: "2026-11-06", stock: 40, projected: true, short: false });
    expect(nov6.events).toEqual([{ kind: "sales", label: "Projected sales", change: -10 }]);
    expect(t.points.find((p) => p.date === "2026-11-10")).toMatchObject({ stock: 0, short: false });
    expect(t.points.find((p) => p.date === "2026-11-11")?.short).toBe(true);
  });

  it("shows an open order landing on its expected day", () => {
    const order: SupplierOrder = {
      id: "o1", name: "GRD-001", productId: "p1", supplierId: "s1", units: 100, notes: "", orderedOn: "2026-11-01",
      confirmedOn: null, tracking: [], state: "open", chasedAt: {}, createdAt: "2026-11-01T16:00:00.000Z", history: [],
    };
    const lands = build(state([order])).points.find((p) => p.events.some((e) => e.kind === "incoming"))!;
    // ordered Nov 1 + 45 days lead time = Dec 16
    expect(lands.date).toBe("2026-12-16");
    expect(lands.events[0]).toMatchObject({ label: "GRD-001 lands", change: 100 });
  });
});
