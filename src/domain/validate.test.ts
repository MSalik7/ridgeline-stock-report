import { describe, expect, it } from "vitest";
import { buildDemoState } from "@/data/demo";
import { cleanState, validRecords, validSettings } from "./validate";

const demo = () => buildDemoState(new Date("2026-11-05T16:30:00Z"));

describe("cleanState", () => {
  it("keeps every record of a healthy business", () => {
    const s = demo();
    const out = cleanState(JSON.parse(JSON.stringify(s)));
    expect(out?.dropped).toBe(0);
    expect(out?.state).toEqual(s);
  });

  it("rejects things that aren't a business", () => {
    for (const x of [null, 42, "hello", [], {}, { products: [] }, { ...demo(), settings: null }, { ...demo(), orders: "nope" }]) {
      expect(cleanState(x)).toBeNull();
    }
  });

  it("leaves out broken records and counts them", () => {
    const s = demo();
    const broken = {
      ...s,
      products: [...s.products, { id: "x" }, null, { ...s.products[0], id: "y", identifiers: "KTL" }],
      orders: [...s.orders, { ...s.orders[0], id: "o-bad", units: "12" }, { ...s.orders[0], id: "o-bad2", history: null }],
      arrivals: [...s.arrivals, { ...s.arrivals[0], id: "a-bad", allocations: [{ orderId: 5, units: 1 }] }],
      sales: [...s.sales, { date: "yesterday", sold: {}, shipped: {} }, { date: "2026-11-06", sold: { KTL: "3" }, shipped: {} }],
    };
    const out = cleanState(broken);
    expect(out?.dropped).toBe(8);
    expect(out?.state.products).toHaveLength(s.products.length);
    expect(out?.state.orders).toHaveLength(s.orders.length);
    expect(out?.state.sales).toHaveLength(s.sales.length);
  });

  it("rejects non-numbers that would show as NaN", () => {
    const p = demo().products[0];
    expect(validRecords("products", [{ ...p, stockCount: { units: Infinity, date: "2026-01-01" } }]).dropped).toBe(1);
    expect(validRecords("products", [{ ...p, identifiers: [{ sku: "A", label: "A", unitsPerSale: 0 }] }]).dropped).toBe(1);
    expect(validRecords("products", [{ ...p, unitCost: "12" }]).dropped).toBe(1);
  });

  it("fills a missing sync status instead of failing", () => {
    const s = demo();
    const out = cleanState({ ...s, feed: undefined });
    expect(out?.state.feed).toEqual({ salesSyncedAt: null, stockSyncedAt: null });
  });
});

describe("validSettings", () => {
  it("needs the forecast numbers and alert recipients", () => {
    const { settings } = demo();
    expect(validSettings(settings)).toBe(true);
    expect(validSettings({ ...settings, forecast: { leadTimeDays: 45 } })).toBe(false);
    expect(validSettings({ ...settings, reorderEmails: {} })).toBe(false);
    expect(validSettings({ ...settings, staleAfterHours: "24" })).toBe(false);
  });
});
