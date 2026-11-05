import type { AppState, Product, SalesDay, StockChange, StoreDate } from "./types";

/** SKU -> product and how many units each sale takes off the shelf. */
export function skuIndex(products: Product[]) {
  const index = new Map<string, { productId: string; unitsPerSale: number }>();
  for (const p of products) {
    for (const id of p.identifiers) {
      index.set(id.sku.trim().toUpperCase(), { productId: p.id, unitsPerSale: id.unitsPerSale });
    }
  }
  return index;
}

function unitsFor(product: Product, perSku: Record<string, number>): number {
  let units = 0;
  for (const id of product.identifiers) {
    const sales = perSku[id.sku] ?? perSku[id.sku.trim().toUpperCase()] ?? 0;
    units += sales * id.unitsPerSale;
  }
  return units;
}

/**
 * Units sold per store day for one product, bundles counted as their real
 * units. Manual sales logged by staff count too; they left the warehouse
 * through their own stock-history line, so they never show as unshipped.
 */
export function unitsSoldByDay(
  sales: SalesDay[],
  product: Product,
  stockChanges: StockChange[] = [],
): Map<StoreDate, number> {
  const out = new Map<StoreDate, number>();
  for (const day of sales) out.set(day.date, unitsFor(product, day.sold));
  for (const c of stockChanges) {
    if (c.productId === product.id && c.kind === "manual_sale") out.set(c.on, (out.get(c.on) ?? 0) + Math.abs(c.units));
  }
  return out;
}

/** Units shipped to customers per store day for one product. */
export function unitsShippedByDay(sales: SalesDay[], product: Product): Map<StoreDate, number> {
  const out = new Map<StoreDate, number>();
  for (const day of sales) {
    const units = unitsFor(product, day.shipped);
    if (units) out.set(day.date, units);
  }
  return out;
}

/** Units customers have bought that the warehouse has not shipped yet. */
export function unshippedUnits(sales: SalesDay[], product: Product): number {
  let units = 0;
  for (const id of product.identifiers) {
    let sold = 0;
    let shipped = 0;
    for (const day of sales) {
      sold += day.sold[id.sku] ?? 0;
      shipped += day.shipped[id.sku] ?? 0;
    }
    units += Math.max(0, sold - shipped) * id.unitsPerSale;
  }
  return units;
}

/** SKUs in the sales data that no product claims, so their sales count nowhere. */
export function unmatchedSkus(state: Pick<AppState, "products" | "sales">) {
  const known = skuIndex(state.products);
  const totals = new Map<string, number>();
  for (const day of state.sales) {
    for (const [sku, n] of Object.entries(day.sold)) {
      if (!known.has(sku.trim().toUpperCase())) totals.set(sku, (totals.get(sku) ?? 0) + n);
    }
  }
  return [...totals].map(([sku, sales]) => ({ sku, sales }));
}
