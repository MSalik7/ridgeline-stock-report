import { addDays } from "./dates";
import type { ForecastSettings, Product, StoreDate } from "./types";

/** Low-stock thresholds from SOP section 4. */
export const LOW_URGENT_DAYS = 21;
export const LOW_WATCH_DAYS = 45;

export const DEFAULT_FORECAST: ForecastSettings = { leadTimeDays: 45, safetyDays: 14, targetDays: 60 };

export function effectiveSettings(defaults: ForecastSettings, product: Pick<Product, "forecast">): ForecastSettings {
  const o = product.forecast ?? {};
  return {
    leadTimeDays: o.leadTimeDays ?? defaults.leadTimeDays,
    safetyDays: o.safetyDays ?? defaults.safetyDays,
    targetDays: o.targetDays ?? defaults.targetDays,
  };
}

/** Rounds to 1 decimal without float drift (0.35 -> 0.4). */
export function round1(x: number): number {
  return Math.round((x + Number.EPSILON) * 10) / 10;
}

export type StockStatus = "out" | "reorder" | "urgent" | "watch" | "ok" | "no_sales";

export const STATUS_LABEL: Record<StockStatus, string> = {
  out: "Out of stock",
  reorder: "Reorder now",
  urgent: "Low, urgent",
  watch: "Low, watch",
  ok: "Healthy",
  no_sales: "No recent sales",
};

/** Most severe first: used to sort the report so problems come to the top. */
export const STATUS_ORDER: StockStatus[] = ["out", "reorder", "urgent", "watch", "no_sales", "ok"];

export interface ForecastInput {
  today: StoreDate;
  /** Units sold on a given store day. */
  unitsOn: (day: StoreDate) => number;
  stock: number;
  placed: number;
  inProduction: number;
  onTheWay: number;
  settings: ForecastSettings;
}

export interface Forecast {
  /** The 7 completed store days before today. */
  window: { from: StoreDate; to: StoreDate };
  daily: { date: StoreDate; units: number }[];
  last3Units: number;
  prior4Units: number;
  sold7: number;
  dailyBurn: number;
  /** Trend before clamping, null when the prior 4 days had no sales. */
  rawTrend: number | null;
  trendFactor: number;
  adjustedBurn: number;
  stock: number;
  onOrder: number;
  daysOfStock: number | null;
  daysWithOrdered: number | null;
  sellsOutOn: StoreDate | null;
  reorderBy: StoreDate | null;
  suggestedOrder: number;
  settings: ForecastSettings;
  /** Lead time + safety days: below this, reorder now. */
  reorderLine: number;
  flags: {
    outOfStock: boolean;
    reorderNow: boolean;
    /** Reorder now even though units are already on order. */
    orderedNotEnough: boolean;
    low: "urgent" | "watch" | null;
  };
  status: StockStatus;
}

/**
 * Sales speed and forecast, SOP section 4, rule for rule.
 *
 * "Last 7 days" means the 7 completed store days before today, so a
 * half-finished today never drags the burn rate down in the morning.
 */
export function computeForecast(input: ForecastInput): Forecast {
  const { today, settings } = input;
  const daily = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 7);
    return { date, units: input.unitsOn(date) };
  });
  const prior4Units = daily.slice(0, 4).reduce((s, d) => s + d.units, 0);
  const last3Units = daily.slice(4).reduce((s, d) => s + d.units, 0);
  const sold7 = prior4Units + last3Units;

  const dailyBurn = sold7 / 7;
  const rawTrend = prior4Units === 0 ? null : last3Units / 3 / (prior4Units / 4);
  const trendFactor = rawTrend === null ? 1 : Math.min(2, Math.max(0.5, rawTrend));
  const adjustedBurn = round1(dailyBurn * trendFactor);

  const stock = Math.max(0, input.stock);
  const onOrder = input.placed + input.inProduction + input.onTheWay;
  const { leadTimeDays, safetyDays, targetDays } = settings;

  const daysOfStock = adjustedBurn > 0 ? stock / adjustedBurn : null;
  const daysWithOrdered = adjustedBurn > 0 ? (stock + onOrder) / adjustedBurn : null;
  const sellsOutOn = daysOfStock === null ? null : addDays(today, Math.floor(daysOfStock));
  const reorderBy =
    daysOfStock === null ? null : addDays(today, Math.floor(daysOfStock - leadTimeDays - safetyDays));
  const rawSuggested = (targetDays + leadTimeDays) * adjustedBurn - stock;
  const suggestedOrder = Math.max(0, Math.ceil(Math.round(rawSuggested * 1e6) / 1e6));

  const reorderLine = leadTimeDays + safetyDays;
  const outOfStock = input.stock <= 0;
  const reorderNow = daysWithOrdered !== null && daysWithOrdered < reorderLine;
  const low =
    daysOfStock === null ? null : daysOfStock < LOW_URGENT_DAYS ? "urgent" : daysOfStock < LOW_WATCH_DAYS ? "watch" : null;

  const status: StockStatus = outOfStock
    ? "out"
    : reorderNow
      ? "reorder"
      : low === "urgent"
        ? "urgent"
        : low === "watch"
          ? "watch"
          : adjustedBurn === 0
            ? "no_sales"
            : "ok";

  return {
    window: { from: daily[0].date, to: daily[6].date },
    daily,
    last3Units,
    prior4Units,
    sold7,
    dailyBurn,
    rawTrend,
    trendFactor,
    adjustedBurn,
    stock,
    onOrder,
    daysOfStock,
    daysWithOrdered,
    sellsOutOn,
    reorderBy,
    suggestedOrder,
    settings,
    reorderLine,
    flags: { outOfStock, reorderNow, orderedNotEnough: reorderNow && onOrder > 0, low },
    status,
  };
}

/** "Try an order": days of stock if `units` more were ordered today. Nothing is saved. */
export function tryOrderDays(f: Forecast, units: number): number | null {
  if (f.adjustedBurn <= 0) return null;
  return (f.stock + f.onOrder + Math.max(0, units)) / f.adjustedBurn;
}
