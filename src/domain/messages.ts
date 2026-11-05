import { formatDay } from "./dates";
import type { ChaseAlert, OrderProgress } from "./orders";
import type { ProductRow } from "./report";
import type { ChaseKind, Product, Settings, Supplier, SupplierOrder } from "./types";

export interface Draft {
  to: string[];
  subject: string;
  body: string;
}

function greeting(s: Supplier | undefined) {
  return `Hi ${s?.contact?.split(" ")[0] || "there"},`;
}

function signoff(settings: Settings) {
  return `Thanks,\nOperations, ${settings.storeName}`;
}

/** The purchase order message sent to the supplier when an order is placed. */
export function orderMessage(
  order: SupplierOrder,
  product: Product | undefined,
  supplier: Supplier | undefined,
  settings: Settings,
): Draft {
  const lines = [
    greeting(supplier),
    "",
    `Please confirm the following order:`,
    "",
    `  Order:    ${order.name}`,
    `  Product:  ${product?.name ?? "Unknown product"} (${product?.code ?? "?"})`,
    `  Units:    ${order.units.toLocaleString("en-US")}`,
    `  Ordered:  ${formatDay(order.orderedOn)}`,
  ];
  if (order.notes) lines.push(`  Notes:    ${order.notes}`);
  lines.push(
    "",
    `Please reply to confirm, or confirm it in the supplier portal. When it ships, add each tracking number with its unit count so we can plan the arrival.`,
    "",
    signoff(settings),
  );
  return {
    to: supplier ? [supplier.email] : [],
    subject: `Order ${order.name}: ${order.units.toLocaleString("en-US")} x ${product?.name ?? "product"}`,
    body: lines.join("\n"),
  };
}

/** One message to a supplier for several orders placed together. */
export function batchOrderMessage(
  orders: SupplierOrder[],
  products: Product[],
  supplier: Supplier | undefined,
  settings: Settings,
  poNumber: string,
): Draft {
  const name = (o: SupplierOrder) => products.find((p) => p.id === o.productId)?.name ?? "Unknown product";
  const width = Math.max(...orders.map((o) => o.name.length));
  const lines = [
    greeting(supplier),
    "",
    `Please confirm these ${orders.length} orders (purchase order ${poNumber}):`,
    "",
    ...orders.map((o) => `  ${o.name.padEnd(width)}  ${o.units.toLocaleString("en-US").padStart(6)} x ${name(o)}`),
  ];
  const notes = orders.filter((o) => o.notes);
  if (notes.length) lines.push("", ...notes.map((o) => `  ${o.name}: ${o.notes}`));
  lines.push(
    "",
    `Each order can ship on its own. Please confirm each one by reply or in the supplier portal, and add tracking numbers with their unit counts to the matching order when they ship.`,
    "",
    signoff(settings),
  );
  return {
    to: supplier ? [supplier.email] : [],
    subject: `${orders.length} orders: ${orders.map((o) => o.name).join(", ")}`,
    body: lines.join("\n"),
  };
}

/** Follow-up for one chase alert. */
export function chaseMessage(
  kind: ChaseKind,
  order: SupplierOrder,
  progress: OrderProgress,
  alert: Pick<ChaseAlert, "reason">,
  product: Product | undefined,
  supplier: Supplier | undefined,
  settings: Settings,
): Draft {
  const what = `${order.name} (${order.units.toLocaleString("en-US")} x ${product?.name ?? "product"}, ordered ${formatDay(order.orderedOn)})`;
  const ask: Record<ChaseKind, { subject: string; text: string }> = {
    confirm: {
      subject: `Please confirm order ${order.name}`,
      text: `We haven't had a confirmation for ${what} yet. Could you confirm the order and let us know the expected ship date?`,
    },
    tracking: {
      subject: `Tracking for order ${order.name}`,
      text: `${what} was confirmed on ${progress.confirmedOn ? formatDay(progress.confirmedOn) : "?"}. ${progress.untracked.toLocaleString("en-US")} units still have no tracking number. Could you send tracking for those units, or the date they will ship?`,
    },
    whereabouts: {
      subject: `Where is order ${order.name}?`,
      text: `${alert.reason} for ${what}. Could you check with the carrier and let us know where it is and when it should arrive?`,
    },
  };
  return {
    to: supplier ? [supplier.email] : [],
    subject: ask[kind].subject,
    body: [greeting(supplier), "", ask[kind].text, "", signoff(settings)].join("\n"),
  };
}

/** The reorder alert email: products below the reorder line. */
export function reorderAlertMessage(rows: ProductRow[], settings: Settings, test = false): Draft {
  const due = rows.filter((r) => r.forecast.flags.reorderNow || r.forecast.flags.outOfStock);
  const lines = [
    test ? "This is a test of the reorder alert email. Nothing was delivered." : "Products that need reordering now:",
    "",
  ];
  if (!due.length) lines.push("Nothing needs reordering today.");
  for (const r of due) {
    const f = r.forecast;
    lines.push(
      `- ${r.product.name} (${r.product.code}): ${r.stock} in stock, ${fmtDays(f.daysOfStock)} of stock, ` +
        `${fmtDays(f.daysWithOrdered)} with ${f.onOrder} on order. Suggested order: ${f.suggestedOrder}.` +
        (f.flags.orderedNotEnough ? " Units already on order are not enough." : ""),
    );
  }
  lines.push("", `Reorder line: lead time + safety days. ${settings.storeName} stock report.`);
  return {
    to: settings.reorderEmails.recipients,
    subject: test ? `[Test] Reorder alert, ${settings.storeName}` : `Reorder alert: ${due.length} product${due.length === 1 ? "" : "s"}`,
    body: lines.join("\n"),
  };
}

function fmtDays(d: number | null) {
  return d === null ? "no sales" : `${d.toFixed(1)} days`;
}
