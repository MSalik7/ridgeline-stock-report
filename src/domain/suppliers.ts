/**
 * Supplier scorecard: how each supplier actually performs, measured from
 * the orders on record, and where the lead-time settings disagree with it.
 */
import { daysBetween } from "./dates";
import { effectiveSettings } from "./forecast";
import type { Report } from "./report";
import type { AppState, Product, Supplier } from "./types";

export interface LeadTimeHint {
  product: Product;
  /** Lead time the forecast uses for this product now. */
  setting: number;
  /** Average days from order to first arrival with this supplier. */
  actual: number;
  orders: number;
}

export interface SupplierScore {
  supplier: Supplier;
  orders: number;
  open: number;
  /** Average days from ordering to confirmation (marked, tracking or arrival). */
  confirmDays: number | null;
  /** Average days from ordering to the first units arriving. */
  leadDays: number | null;
  /** Share of delivered orders whose first units arrived within the lead-time setting. */
  onTimeRate: number | null;
  delivered: number;
  /** Units never delivered on closed orders, as a share of their ordered units. */
  shortRate: number | null;
  shortUnits: number;
  /** Open orders that are past their expected date right now. */
  lateNow: number;
  /** Products where the real lead time is at least 3 days off the setting. */
  hints: LeadTimeHint[];
  verdict: { label: string; tone: "ok" | "watch" | "bad" };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function supplierScores(state: AppState, report: Report): SupplierScore[] {
  return state.suppliers.map((supplier) => {
    const views = report.orders.filter((o) => o.order.supplierId === supplier.id && o.status !== "cancelled");
    const confirmDays = avg(views.filter((v) => v.progress.confirmedOn).map((v) => daysBetween(v.order.orderedOn, v.progress.confirmedOn!)));

    const delivered = views.filter((v) => v.progress.firstArrivalOn);
    const lead = delivered.map((v) => daysBetween(v.order.orderedOn, v.progress.firstArrivalOn!));
    const onTime = delivered.filter((v) => {
      const p = v.product ? effectiveSettings(state.settings.forecast, v.product).leadTimeDays : state.settings.forecast.leadTimeDays;
      return daysBetween(v.order.orderedOn, v.progress.firstArrivalOn!) <= p;
    }).length;

    const closed = views.filter((v) => v.status === "closed");
    const shortUnits = closed.reduce((s, v) => s + v.progress.remaining, 0);
    const closedUnits = closed.reduce((s, v) => s + v.order.units, 0);

    const lateNow = views.filter((v) => v.open && v.incoming.some((i) => i.late)).length;

    const byProduct = new Map<string, number[]>();
    for (const v of delivered) {
      const list = byProduct.get(v.order.productId) ?? [];
      list.push(daysBetween(v.order.orderedOn, v.progress.firstArrivalOn!));
      byProduct.set(v.order.productId, list);
    }
    const hints: LeadTimeHint[] = [];
    for (const [productId, days] of byProduct) {
      const product = state.products.find((p) => p.id === productId);
      if (!product || product.supplierId !== supplier.id) continue;
      const setting = effectiveSettings(state.settings.forecast, product).leadTimeDays;
      const actual = Math.round(avg(days)!);
      if (Math.abs(actual - setting) >= 3) hints.push({ product, setting, actual, orders: days.length });
    }

    const onTimeRate = delivered.length ? onTime / delivered.length : null;
    const shortRate = closedUnits ? shortUnits / closedUnits : null;
    const verdict =
      lateNow > 0 || (onTimeRate !== null && onTimeRate < 0.5)
        ? { label: lateNow > 0 ? "Late shipment now" : "Often late", tone: "bad" as const }
        : (confirmDays ?? 0) > 4 || (shortRate ?? 0) > 0.05 || (onTimeRate !== null && onTimeRate < 0.8)
          ? { label: (shortRate ?? 0) > 0.05 ? "Ships short" : (confirmDays ?? 0) > 4 ? "Slow to confirm" : "Sometimes late", tone: "watch" as const }
          : { label: "Reliable", tone: "ok" as const };

    return {
      supplier,
      orders: views.length,
      open: views.filter((v) => v.open).length,
      confirmDays,
      leadDays: avg(lead),
      onTimeRate,
      delivered: delivered.length,
      shortRate,
      shortUnits,
      lateNow,
      hints,
      verdict,
    };
  });
}
