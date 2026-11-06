import { unmatchedUnits } from "./arrivals";
import { byTime, daysBetween, storeDateOf } from "./dates";
import { STATUS_ORDER, computeForecast, effectiveSettings, type Forecast } from "./forecast";
import {
  arrivalsByOrder,
  chaseAlerts,
  isOpenStatus,
  orderProgress,
  orderStatus,
  type ChaseAlert,
  type OrderProgress,
  type OrderStatus,
} from "./orders";
import { buildOutlook, incomingForOrder, type Incoming, type Outlook } from "./outlook";
import { unitsSoldByDay, unmatchedSkus, unshippedUnits } from "./sales";
import { warehouseStock } from "./stock";
import type { AppState, Arrival, Product, StoreDate, Supplier, SupplierOrder } from "./types";

export interface OrderView {
  order: SupplierOrder;
  product: Product | undefined;
  supplier: Supplier | undefined;
  progress: OrderProgress;
  status: OrderStatus;
  open: boolean;
  alerts: ChaseAlert[];
  /** Units still to come and when they should land (open orders only). */
  incoming: Incoming[];
}

export interface ProductRow {
  product: Product;
  supplier: Supplier | undefined;
  stock: number;
  unshipped: number;
  placed: number;
  inProduction: number;
  onTheWay: number;
  openOrders: OrderView[];
  forecast: Forecast;
  /** When open orders land and whether stock runs out first. */
  outlook: Outlook;
  /** Units sold per store day, all days on record. */
  sales: Map<StoreDate, number>;
}

export interface Report {
  today: StoreDate;
  products: ProductRow[];
  orders: OrderView[];
  orderById: Map<string, OrderView>;
  unmatchedArrivals: { arrival: Arrival; units: number }[];
  /** Alerts whose follow-up is due now. */
  chaseDue: ChaseAlert[];
  /** Alerts followed up recently; they come back when due. */
  chaseWaiting: ChaseAlert[];
  unmatchedSkus: { sku: string; sales: number }[];
  stale: { sales: boolean; stock: boolean; salesAgeHours: number | null; stockAgeHours: number | null };
  counts: { out: number; reorder: number; low: number; chase: number; unmatched: number };
}

/** Everything the screens show, derived from stored records in one pass. */
export function buildReport(state: AppState, now: Date): Report {
  const today = storeDateOf(now);
  const productById = new Map(state.products.map((p) => [p.id, p]));
  const supplierById = new Map(state.suppliers.map((s) => [s.id, s]));
  const arrived = arrivalsByOrder(state.arrivals);
  const settingsOf = new Map(state.products.map((p) => [p.id, effectiveSettings(state.settings.forecast, p)]));

  const orders: OrderView[] = state.orders.map((order) => {
    const progress = orderProgress(order, arrived.get(order.id));
    const status = orderStatus(order, progress);
    const open = isOpenStatus(status);
    const lead = (settingsOf.get(order.productId) ?? state.settings.forecast).leadTimeDays;
    return {
      order,
      product: productById.get(order.productId),
      supplier: supplierById.get(order.supplierId),
      progress,
      status,
      open,
      alerts: chaseAlerts(order, progress, status, today),
      incoming: open ? incomingForOrder(order, progress, lead, today) : [],
    };
  });
  orders.sort((a, b) => byTime(b.order.orderedOn, a.order.orderedOn) || b.order.name.localeCompare(a.order.name));

  const openByProduct = new Map<string, OrderView[]>();
  for (const o of orders) {
    if (!o.open) continue;
    const list = openByProduct.get(o.order.productId);
    if (list) list.push(o);
    else openByProduct.set(o.order.productId, [o]);
  }

  const products: ProductRow[] = state.products.map((product) => {
    const openOrders = openByProduct.get(product.id) ?? [];
    const placed = sum(openOrders, (o) => o.progress.placed);
    const inProduction = sum(openOrders, (o) => o.progress.inProduction);
    const onTheWay = sum(openOrders, (o) => o.progress.onTheWay);
    const stock = warehouseStock(state, product);
    const sales = unitsSoldByDay(state.sales, product, state.stockChanges);
    const forecast = computeForecast({
      today,
      unitsOn: (d) => sales.get(d) ?? 0,
      stock,
      placed,
      inProduction,
      onTheWay,
      settings: settingsOf.get(product.id)!,
    });
    const outlook = buildOutlook({
      stock,
      burn: forecast.adjustedBurn,
      incoming: openOrders.flatMap((o) => o.incoming),
      today,
      minHorizon: forecast.reorderLine,
    });
    return {
      product,
      supplier: supplierById.get(product.supplierId),
      stock,
      unshipped: unshippedUnits(state.sales, product),
      placed,
      inProduction,
      onTheWay,
      openOrders,
      forecast,
      outlook,
      sales,
    };
  });
  products.sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.forecast.status) - STATUS_ORDER.indexOf(b.forecast.status) ||
      (a.forecast.daysOfStock ?? Infinity) - (b.forecast.daysOfStock ?? Infinity),
  );

  const unmatchedArrivals = state.arrivals
    .map((arrival) => ({ arrival, units: unmatchedUnits(arrival) }))
    .filter((u) => u.units > 0)
    .sort((a, b) => byTime(a.arrival.receivedOn, b.arrival.receivedOn));

  const allAlerts = orders.flatMap((o) => o.alerts);
  const chaseDue = allAlerts.filter((a) => a.due).sort((a, b) => byTime(a.since, b.since));
  const chaseWaiting = allAlerts.filter((a) => !a.due);

  const ageHours = (t: string | null) => (t ? (now.getTime() - new Date(t).getTime()) / 3_600_000 : null);
  const salesAgeHours = ageHours(state.feed.salesSyncedAt);
  const stockAgeHours = ageHours(state.feed.stockSyncedAt);
  const limit = state.settings.staleAfterHours;

  return {
    today,
    products,
    orders,
    orderById: new Map(orders.map((o) => [o.order.id, o])),
    unmatchedArrivals,
    chaseDue,
    chaseWaiting,
    unmatchedSkus: unmatchedSkus(state),
    stale: {
      sales: salesAgeHours === null || salesAgeHours > limit,
      stock: stockAgeHours === null || stockAgeHours > limit,
      salesAgeHours,
      stockAgeHours,
    },
    counts: {
      out: products.filter((p) => p.forecast.flags.outOfStock).length,
      reorder: products.filter((p) => p.forecast.flags.reorderNow).length,
      low: products.filter((p) => p.forecast.flags.low !== null && !p.forecast.flags.outOfStock).length,
      chase: chaseDue.length,
      unmatched: unmatchedArrivals.length,
    },
  };
}

function sum<T>(xs: T[], f: (x: T) => number) {
  return xs.reduce((s, x) => s + f(x), 0);
}

/** Days an order has been open, for list views. */
export function orderAgeDays(o: SupplierOrder, today: StoreDate) {
  return daysBetween(o.orderedOn, today);
}
