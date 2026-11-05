/**
 * The demo data has to exercise every rule, whatever day it is generated on.
 */
import { describe, expect, it } from "vitest";
import { buildReport } from "@/domain/report";
import { addDays, storeDateOf } from "@/domain/dates";
import { stockLedger } from "@/domain/stock";
import { buildDemoState } from "./demo";
import { syncFeed } from "./feed";
import { applyChanges } from "./apply";

const days = ["2026-11-05T16:30:00Z", "2026-07-14T21:00:00Z", "2027-02-01T03:00:00Z", "2026-03-08T15:00:00Z"];

describe.each(days)("demo generated at %s", (iso) => {
  const now = new Date(iso);
  const state = buildDemoState(now);
  const r = buildReport(state, now);
  const by = (code: string) => r.products.find((p) => p.product.code === code)!;

  it("has 5+ products and 30+ days of sales", () => {
    expect(state.products.length).toBeGreaterThanOrEqual(5);
    const today = storeDateOf(now);
    const withSales = state.sales.filter((d) => d.date < today && Object.values(d.sold).some((n) => n > 0));
    expect(withSales.length).toBeGreaterThanOrEqual(30);
  });

  it("uses only @example.com email addresses (SOP section 5)", () => {
    const emails = JSON.stringify(state).match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? [];
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.filter((e) => !e.endsWith("@example.com"))).toEqual([]);
  });

  it("shows every stock flag", () => {
    expect(by("CBJ").forecast.status).toBe("out");
    expect(by("GRD").forecast.status).toBe("reorder");
    expect(by("GRD").forecast.flags.orderedNotEnough).toBe(true);
    expect(by("FLT").forecast.status).toBe("urgent");
    expect(by("KTL").forecast.status).toBe("watch");
    expect(by("DRP").forecast.status).toBe("ok");
    expect(by("MUG").forecast.status).toBe("ok");
    for (const p of r.products) expect(p.forecast.adjustedBurn).toBeGreaterThan(0);
  });

  it("shows every order status and chase kind", () => {
    const statuses = new Set(r.orders.map((o) => o.status));
    for (const s of ["placed", "in_production", "on_the_way", "partial", "received", "closed", "cancelled"]) {
      expect(statuses).toContain(s);
    }
    expect(r.chaseDue.map((a) => a.kind).sort()).toEqual(["confirm", "whereabouts"]);
    expect(r.chaseWaiting.map((a) => a.kind)).toEqual(["tracking"]);
    expect(r.unmatchedArrivals).toHaveLength(1);
  });

  it("never lets stock go negative in history", () => {
    for (const p of state.products) {
      for (const row of stockLedger(state, p)) expect(row.balance).toBeGreaterThanOrEqual(0);
    }
  });

  it("CBJ has backorders: sold but not shipped", () => {
    expect(by("CBJ").unshipped).toBeGreaterThan(10);
  });

  it("syncing days later keeps forecasts alive and fresh", () => {
    const later = new Date(now.getTime() + 4 * 86_400_000);
    const before = buildReport(state, later);
    expect(before.stale.sales).toBe(true);
    const synced = applyChanges(state, syncFeed(state, later));
    const after = buildReport(synced, later);
    expect(after.stale.sales).toBe(false);
    expect(synced.sales.some((d) => d.date === addDays(storeDateOf(now), 3))).toBe(true);
    for (const p of after.products) expect(p.forecast.sold7).toBeGreaterThan(0);
    // syncing twice in a row changes nothing
    expect(applyChanges(synced, syncFeed(synced, later)).sales).toEqual(synced.sales);
  });
});

it("prints the demo report", () => {
  const now = new Date("2026-11-05T16:30:00Z");
  const r = buildReport(buildDemoState(now), now);
  for (const p of r.products) {
    const f = p.forecast;
    console.log(
      p.product.code.padEnd(4),
      `stock ${p.stock}`.padEnd(11),
      `unship ${p.unshipped}`.padEnd(10),
      `sold7 ${f.sold7}`.padEnd(10),
      `trend ${f.trendFactor.toFixed(2)}`.padEnd(11),
      `burn ${f.adjustedBurn}`.padEnd(10),
      `days ${f.daysOfStock?.toFixed(1)}`.padEnd(11),
      `w/ord ${f.daysWithOrdered?.toFixed(1)}`.padEnd(12),
      `sugg ${f.suggestedOrder}`.padEnd(10),
      f.status,
    );
  }
});
