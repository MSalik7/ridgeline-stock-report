/**
 * Money: what the stock is worth, what is already committed to suppliers,
 * and what the next reorders will cost. Everything is units x unit cost;
 * units come from the same report the rest of the app uses.
 *
 * An order keeps the unit cost it was placed at. Orders from before costs
 * were recorded fall back to the product's current cost.
 */
import { addDays, daysBetween } from "./dates";
import type { ProductRow, Report } from "./report";
import type { Product, StoreDate, Supplier, SupplierOrder } from "./types";

export function orderUnitCost(order: Pick<SupplierOrder, "unitCost">, product: Pick<Product, "unitCost"> | undefined): number | null {
  return order.unitCost ?? product?.unitCost ?? null;
}

/** Dollars, rounded to cents so sums don't drift. */
const cents = (x: number) => Math.round(x * 100) / 100;

export interface MoneyLine {
  row: ProductRow;
  unitCost: number | null;
  stockValue: number;
  onOrderValue: number;
  /** Units beyond lead time + target days of sales: more than any reorder would aim for. */
  excessUnits: number;
  excessValue: number;
  /** Suggested order when the product is past its reorder line, else 0. */
  reorderUnits: number;
  reorderValue: number;
}

export interface SupplierMoney {
  supplier: Supplier;
  openOrders: number;
  committed: number;
  /** Value of units whose expected arrival has passed. */
  late: number;
  lateUnits: number;
}

export interface Money {
  lines: MoneyLine[];
  /** Products with no unit cost; their units are left out of every total. */
  missingCost: Product[];
  stockValue: number;
  stockUnits: number;
  onOrder: { placed: number; inProduction: number; onTheWay: number; total: number };
  reorderDue: { products: number; units: number; value: number };
  excess: { products: number; units: number; value: number };
  suppliers: SupplierMoney[];
  /** Committed cash expected to land, by week, for the next 8 weeks (late units count in week one). */
  landing: { weekOf: StoreDate; value: number }[];
}

export function buildMoney(report: Report): Money {
  const lines: MoneyLine[] = [];
  const missingCost: Product[] = [];
  const onOrder = { placed: 0, inProduction: 0, onTheWay: 0, total: 0 };
  const bySupplier = new Map<string, SupplierMoney>();
  const landing = Array.from({ length: 8 }, (_, i) => ({ weekOf: addDays(report.today, i * 7), value: 0 }));

  for (const row of report.products) {
    const cost = row.product.unitCost ?? null;
    if (cost === null) missingCost.push(row.product);
    const f = row.forecast;
    const stock = Math.max(0, row.stock);
    const keep = f.adjustedBurn > 0 ? (f.settings.leadTimeDays + f.settings.targetDays) * f.adjustedBurn : 0;
    const excessUnits = Math.max(0, Math.floor(stock - keep));
    const reorderUnits = f.flags.reorderNow ? f.suggestedOrder : 0;

    let onOrderValue = 0;
    for (const o of row.openOrders) {
      const c = orderUnitCost(o.order, row.product);
      if (c === null) continue;
      onOrder.placed += o.progress.placed * c;
      onOrder.inProduction += o.progress.inProduction * c;
      onOrder.onTheWay += o.progress.onTheWay * c;
      onOrderValue += o.progress.remaining * c;
      if (o.supplier) {
        const s = bySupplier.get(o.supplier.id) ?? { supplier: o.supplier, openOrders: 0, committed: 0, late: 0, lateUnits: 0 };
        s.openOrders += 1;
        s.committed += o.progress.remaining * c;
        for (const i of o.incoming) {
          if (i.late) {
            s.late += i.units * c;
            s.lateUnits += i.units;
          }
          const week = Math.max(0, Math.floor(daysBetween(report.today, i.expectedOn) / 7));
          if (week < landing.length) landing[week].value += i.units * c;
        }
        bySupplier.set(o.supplier.id, s);
      }
    }

    lines.push({
      row,
      unitCost: cost,
      stockValue: cost === null ? 0 : cents(stock * cost),
      onOrderValue: cents(onOrderValue),
      excessUnits,
      excessValue: cost === null ? 0 : cents(excessUnits * cost),
      reorderUnits,
      reorderValue: cost === null ? 0 : cents(reorderUnits * cost),
    });
  }

  onOrder.placed = cents(onOrder.placed);
  onOrder.inProduction = cents(onOrder.inProduction);
  onOrder.onTheWay = cents(onOrder.onTheWay);
  onOrder.total = cents(onOrder.placed + onOrder.inProduction + onOrder.onTheWay);

  const priced = lines.filter((l) => l.unitCost !== null);
  const due = priced.filter((l) => l.reorderUnits > 0);
  const over = priced.filter((l) => l.excessUnits > 0);
  return {
    lines: [...lines].sort((a, b) => b.stockValue + b.onOrderValue - (a.stockValue + a.onOrderValue)),
    missingCost,
    stockValue: cents(priced.reduce((s, l) => s + l.stockValue, 0)),
    stockUnits: priced.reduce((s, l) => s + Math.max(0, l.row.stock), 0),
    onOrder,
    reorderDue: {
      products: due.length,
      units: due.reduce((s, l) => s + l.reorderUnits, 0),
      value: cents(due.reduce((s, l) => s + l.reorderValue, 0)),
    },
    excess: {
      products: over.length,
      units: over.reduce((s, l) => s + l.excessUnits, 0),
      value: cents(over.reduce((s, l) => s + l.excessValue, 0)),
    },
    suppliers: [...bySupplier.values()]
      .map((s) => ({ ...s, committed: cents(s.committed), late: cents(s.late) }))
      .sort((a, b) => b.committed - a.committed),
    landing: landing.map((w) => ({ ...w, value: cents(w.value) })),
  };
}
