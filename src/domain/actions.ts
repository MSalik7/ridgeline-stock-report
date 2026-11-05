/**
 * The day's to-do list for operations staff, derived from the report.
 * Every item comes with the one action that resolves it.
 */
import { daysBetween, formatDay, storeDateOf } from "./dates";
import { CHASE_LABEL } from "./orders";
import type { ProductRow, Report } from "./report";
import type { Actor, AppState, ChaseKind } from "./types";

export type Severity = "critical" | "high" | "normal";

export type TodayAction =
  | { kind: "reorder"; key: string; severity: Severity; title: string; detail: string; productId: string; units: number }
  | { kind: "chase"; key: string; severity: Severity; title: string; detail: string; orderId: string; chase: ChaseKind }
  | { kind: "match"; key: string; severity: Severity; title: string; detail: string; arrivalId: string }
  | { kind: "gap"; key: string; severity: Severity; title: string; detail: string; productId: string };

const RANK: Record<Severity, number> = { critical: 0, high: 1, normal: 2 };
const KIND_RANK: Record<TodayAction["kind"], number> = { reorder: 0, gap: 1, chase: 2, match: 3 };

function days(n: number | null) {
  return n === null ? "no sales" : `${n.toFixed(1)} days`;
}

function gapNote(r: ProductRow, today: string): string {
  const o = r.outlook;
  if (!o.runsOutOn) return "";
  const when = o.runsOutOn <= today ? "Out of stock now" : `Runs out ${formatDay(o.runsOutOn)}`;
  if (!o.nextStock) return ` ${when}, nothing on the way.`;
  if (o.nextStock.late) return ` ${when}; next stock is ${o.nextStock.orderName}, ${o.nextStock.daysLate} days late.`;
  return ` ${when}, back ${formatDay(o.nextStock.expectedOn)} when ${o.nextStock.orderName} lands.`;
}

export function todayActions(report: Report): TodayAction[] {
  const out: TodayAction[] = [];
  const byProduct = new Map(report.products.map((r) => [r.product.id, r]));
  const covered = new Set<string>();

  for (const r of report.products) {
    const f = r.forecast;
    if (!f.flags.reorderNow) continue;
    covered.add(r.product.id);
    out.push({
      kind: "reorder",
      key: `reorder-${r.product.id}`,
      severity: f.flags.outOfStock || r.outlook.runsOutOn ? "critical" : "high",
      title: `Reorder ${r.product.name}`,
      detail:
        (f.flags.orderedNotEnough
          ? `Even with ${r.forecast.onOrder.toLocaleString("en-US")} on order, stock lasts ${days(f.daysWithOrdered)}, under the ${f.reorderLine}-day line.`
          : `Stock lasts ${days(f.daysWithOrdered)} and nothing is on order.`) + gapNote(r, report.today),
      productId: r.product.id,
      units: f.suggestedOrder,
    });
  }

  for (const a of report.chaseDue) {
    const o = report.orderById.get(a.orderId);
    if (!o) continue;
    const r = byProduct.get(o.order.productId);
    const isNextStock = r?.outlook.nextStock?.orderId === o.order.id;
    const critical = !!r && (r.forecast.flags.outOfStock || !!r.outlook.runsOutOn) && isNextStock;
    if (critical && r) covered.add(r.product.id);
    out.push({
      kind: "chase",
      key: `chase-${a.orderId}-${a.kind}`,
      severity: critical ? "critical" : r && ["reorder", "urgent"].includes(r.forecast.status) ? "high" : "normal",
      title: `${CHASE_LABEL[a.kind]}: ${o.order.name}`,
      detail: `${a.reason}.${critical && r ? ` ${r.product.name} ${r.forecast.flags.outOfStock ? "is out of stock" : `runs out ${formatDay(r.outlook.runsOutOn!)}`} and this is the next stock.` : ""} ${o.supplier?.name ?? ""}`.trim(),
      orderId: a.orderId,
      chase: a.kind,
    });
  }

  // Stock that runs out before the next arrival, where nothing above already covers it.
  for (const r of report.products) {
    if (covered.has(r.product.id) || !r.outlook.runsOutOn) continue;
    // Only gaps inside the planning window (lead time + safety) need someone today.
    if (daysBetween(report.today, r.outlook.runsOutOn) > r.forecast.reorderLine) continue;
    out.push({
      kind: "gap",
      key: `gap-${r.product.id}`,
      severity: r.forecast.flags.outOfStock ? "critical" : "high",
      title: r.forecast.flags.outOfStock ? `${r.product.name} is out of stock` : `${r.product.name} runs out before the next delivery`,
      detail: `${r.unshipped && r.forecast.flags.outOfStock ? `${r.unshipped.toLocaleString("en-US")} sold and waiting to ship.` : ""}${gapNote(r, report.today)}`.trim(),
      productId: r.product.id,
    });
  }

  for (const u of report.unmatchedArrivals) {
    const r = byProduct.get(u.arrival.productId);
    out.push({
      kind: "match",
      key: `match-${u.arrival.id}`,
      severity: "normal",
      title: `Match ${u.units.toLocaleString("en-US")} units from ${u.arrival.name}`,
      detail: `${r?.product.name ?? "A product"} received ${formatDay(u.arrival.receivedOn)}. No supplier order explains them yet.`,
      arrivalId: u.arrival.id,
    });
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity] || KIND_RANK[a.kind] - KIND_RANK[b.kind]);
}

export interface DoneItem {
  key: string;
  at: string;
  text: string;
  actor: Actor | null;
  href?: string;
}

const DONE_ACTIONS = /^(Placed order|Sent order to supplier|Sent follow-up|Confirmed order|Added tracking|Closed order|Cancelled order)/;

/** What people already did today, newest first, so the list ends with a sense of progress. */
export function doneToday(state: AppState, today: string): DoneItem[] {
  const out: DoneItem[] = [];
  for (const o of state.orders) {
    o.history.forEach((h, i) => {
      if (storeDateOf(h.at) !== today || !DONE_ACTIONS.test(h.action)) return;
      out.push({ key: `o-${o.id}-${i}`, at: h.at, text: `${h.action} · ${o.name}`, actor: h.actor, href: `#order-${o.id}` });
    });
  }
  for (const a of state.arrivals) {
    a.history.forEach((h, i) => {
      if (storeDateOf(h.at) !== today) return;
      out.push({ key: `a-${a.id}-${i}`, at: h.at, text: `${h.action === "Recorded arrival" ? "Recorded arrival" : "Changed match"} · ${a.name}`, actor: h.actor, href: "#arrivals" });
    });
  }
  for (const c of state.stockChanges) {
    if (storeDateOf(c.at) !== today) continue;
    out.push({ key: `c-${c.id}`, at: c.at, text: `${c.kind === "manual_sale" ? "Logged a sale" : "Adjusted stock"} · ${c.note}`, actor: c.actor, href: `#history-${c.productId}` });
  }
  return out.sort((x, y) => y.at.localeCompare(x.at));
}
