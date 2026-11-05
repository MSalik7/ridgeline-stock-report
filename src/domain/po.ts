/**
 * A purchase order document for one supplier: one line per supplier order.
 * Usually that is one order; a planned batch to the same supplier becomes
 * one document with several lines.
 */
import { addDays } from "./dates";
import { effectiveSettings } from "./forecast";
import { orderUnitCost } from "./money";
import type { AppState, StoreDate, Supplier } from "./types";

/** The demo business's own details. Fake, like all data here. */
export const BUYER = {
  address: ["1200 Example Street, Unit 4", "Denver, CO 80216"],
  email: "purchasing@example.com",
  shipTo: ["Ridgeline warehouse, Dock 2", "1200 Example Street, Unit 4", "Denver, CO 80216"],
};

export interface PoLine {
  orderId: string;
  orderName: string;
  code: string;
  name: string;
  units: number;
  unitCost: number | null;
  total: number | null;
  expectedOn: StoreDate;
}

export interface PurchaseOrder {
  number: string;
  date: StoreDate;
  buyer: string;
  supplier: Supplier | undefined;
  lines: PoLine[];
  /** Sum of the lines that have a cost. */
  subtotal: number;
  /** True when some line has no unit cost, so the total is incomplete. */
  missingCost: boolean;
  notes: string[];
  terms: string[];
}

export function purchaseOrder(state: AppState, orderIds: string[]): PurchaseOrder | null {
  const orders = orderIds.map((id) => state.orders.find((o) => o.id === id)).filter((o) => !!o);
  if (!orders.length) return null;
  const supplier = state.suppliers.find((s) => s.id === orders[0].supplierId);
  const lines: PoLine[] = orders.map((o) => {
    const p = state.products.find((x) => x.id === o.productId);
    const cost = orderUnitCost(o, p);
    const lead = effectiveSettings(state.settings.forecast, p ?? { forecast: {} }).leadTimeDays;
    return {
      orderId: o.id,
      orderName: o.name,
      code: p?.code ?? "?",
      name: p?.name ?? "Deleted product",
      units: o.units,
      unitCost: cost,
      total: cost === null ? null : Math.round(cost * o.units * 100) / 100,
      expectedOn: addDays(o.orderedOn, lead),
    };
  });
  const date = orders.reduce((d, o) => (o.orderedOn > d ? o.orderedOn : d), orders[0].orderedOn);
  const initials = (supplier?.name ?? "SUP")
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 4);
  return {
    number: orders.length === 1 ? `PO-${orders[0].name}` : `PO-${date.replace(/-/g, "")}-${initials}`,
    date,
    buyer: state.settings.storeName,
    supplier,
    lines,
    subtotal: Math.round(lines.reduce((s, l) => s + (l.total ?? 0), 0) * 100) / 100,
    missingCost: lines.some((l) => l.total === null),
    notes: orders.filter((o) => o.notes).map((o) => `${o.name}: ${o.notes}`),
    terms: [
      "Please confirm within 2 days, by reply or in the supplier portal.",
      "When it ships, send each tracking number with the units in that shipment.",
      "Prices are in US dollars. Payment is net 30 from delivery.",
    ],
  };
}
