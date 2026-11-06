import { describe, expect, it } from "vitest";
import { buildDemoState } from "@/data/demo";
import { isStoreDate } from "./dates";
import { ActionError, createOrder, editArrival, logStockChange, recordArrival, saveProduct } from "./mutations";
import { validRecords } from "./validate";

const now = new Date("2026-11-05T16:30:00Z");
const actor = { role: "staff" as const };
const demo = () => buildDemoState(now);

describe("isStoreDate", () => {
  it("accepts real days only", () => {
    for (const d of ["2026-11-05", "2024-02-29", "2000-01-01"]) expect(isStoreDate(d)).toBe(true);
    for (const d of ["2026-02-31", "2025-02-29", "0000-00-00", "2026-13-01", "20266-01-01", "2026-1-5", "", null, 20261105]) {
      expect(isStoreDate(d)).toBe(false);
    }
  });

  it("is what saved data is checked against", () => {
    const p = demo().products[0];
    expect(validRecords("products", [{ ...p, stockCount: { units: 5, date: "2026-13-45" } }]).dropped).toBe(1);
  });
});

describe("typed dates and numbers", () => {
  const s = demo();
  const product = s.products[0];
  const arrival = (receivedOn: string, units = 10) =>
    recordArrival(s, { productId: product.id, units, receivedOn, note: "", allocations: [{ orderId: null, units }] }, actor, now);

  it("refuses dates that can't be real, are ahead, or have a year typo", () => {
    expect(() => arrival("2026-02-31")).toThrow(/isn't a real date/);
    expect(() => arrival("2026-11-06")).toThrow(/future/);
    expect(() => arrival("20266-01-01")).toThrow(/isn't a real date/);
    expect(() => arrival("0202-11-05")).toThrow(/before 2000/);
    expect(() => arrival("2026-11-05")).not.toThrow();
  });

  it("checks the date on every action that takes one", () => {
    const a = s.arrivals[0];
    expect(() => editArrival(s, a.id, { units: a.units, receivedOn: "1999-12-31", note: "" }, actor, now)).toThrow(ActionError);
    expect(() => logStockChange(s, { productId: product.id, kind: "adjustment", units: -2, note: "Count", on: "2026-11-31" }, actor, now)).toThrow(ActionError);
    expect(() =>
      createOrder(s, { productId: product.id, supplierId: product.supplierId, units: 10, notes: "", orderedOn: "2027-01-01" }, actor, now),
    ).toThrow(/future/);
  });

  it("refuses a slipped key on units", () => {
    expect(() => arrival("2026-11-05", 1_000_001)).toThrow(/more than 1,000,000/);
    expect(() => logStockChange(s, { productId: product.id, kind: "adjustment", units: -5_000_000, note: "x", on: "2026-11-05" }, actor, now)).toThrow(
      /more than 1,000,000/,
    );
    expect(() => saveProduct(s, { ...product, stockCount: { units: -1, date: "2026-11-05" } })).toThrow(/0 to 10,000,000/);
    expect(() => saveProduct(s, { ...product, stockCount: { units: 5, date: "2026-02-30" } })).toThrow(/real date/);
  });
});
