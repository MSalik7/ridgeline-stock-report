/**
 * The activity feed behind the bell: what happened recently, newest first.
 *
 * Most items come straight from the history every order and arrival keeps.
 * Two are derived, because nobody "does" them: a shipment turning late the
 * day after it was due, and a product running out the day its stock hit 0.
 */
import { addDays, byTime, formatDay } from "./dates";
import type { Report } from "./report";
import { stockLedger } from "./stock";
import type { Actor, AppState, Timestamp } from "./types";

export type ActivityKind = "supplier" | "order" | "followup" | "arrival" | "stock" | "late" | "out";

export interface Activity {
  key: string;
  at: Timestamp;
  kind: ActivityKind;
  title: string;
  detail?: string;
  href: string;
  actor: Actor | null;
  /** Done by the person looking: never counted as new for them. */
  mine: boolean;
}

export const FEED_DAYS = 14;

function sameActor(a: Actor | null, me: Actor) {
  if (!a || a.role !== me.role) return false;
  if (a.role === "supplier") return a.supplierId === me.supplierId;
  return (a.userId ?? null) === (me.userId ?? null);
}

const ORDER_VERB: Record<string, string> = {
  "Cancelled order": "Cancelled",
  "Closed order": "Closed",
  "Reopened order": "Reopened",
  "Edited order": "Edited",
  "Removed tracking": "Removed tracking from",
  "Arrival deleted": "Arrival deleted for",
};

export function activityFeed(state: AppState, report: Report, me: Actor, now: Date, days = FEED_DAYS): Activity[] {
  const out: Omit<Activity, "mine">[] = [];
  const product = new Map(state.products.map((p) => [p.id, p]));
  const supplier = new Map(state.suppliers.map((s) => [s.id, s]));

  // Only the window is ever shown, so skip older history before building anything.
  const fromMs = now.getTime() - days * 86_400_000;
  const inWindow = (at: string) => {
    const t = new Date(at).getTime();
    return t >= fromMs && t <= now.getTime();
  };

  for (const o of state.orders) {
    const p = product.get(o.productId);
    const s = supplier.get(o.supplierId);
    o.history.forEach((h, i) => {
      if (!inWindow(h.at)) return;
      const base = { key: `o-${o.id}-${i}`, at: h.at, actor: h.actor, href: `#order-${o.id}` };
      const bySupplier = h.actor.role === "supplier";
      const who = (bySupplier ? supplier.get(h.actor.supplierId ?? "")?.name : null) ?? s?.name ?? "The supplier";
      if (h.action === "Placed order") {
        out.push({ ...base, kind: "order", title: `Placed ${o.name}`, detail: `${o.units.toLocaleString("en-US")} × ${p?.name ?? "product"} from ${s?.name ?? "a supplier"}` });
      } else if (h.action === "Confirmed order") {
        out.push({ ...base, kind: bySupplier ? "supplier" : "order", title: bySupplier ? `${who} confirmed ${o.name}` : `${o.name} marked confirmed`, detail: "In production" });
      } else if (h.action.startsWith("Added tracking")) {
        out.push({ ...base, kind: bySupplier ? "supplier" : "order", title: bySupplier ? `${who} added tracking to ${o.name}` : `Tracking added to ${o.name}`, detail: h.detail });
      } else if (h.action.startsWith("Sent follow-up: ")) {
        out.push({ ...base, kind: "followup", title: `Followed up on ${o.name}`, detail: `${h.action.slice(16)} · ${h.detail ?? ""}`.replace(/ · $/, "") });
      } else if (ORDER_VERB[h.action]) {
        out.push({ ...base, kind: "order", title: `${ORDER_VERB[h.action]} ${o.name}`, detail: h.detail });
      }
    });
  }

  for (const a of state.arrivals) {
    const p = product.get(a.productId);
    a.history.forEach((h, i) => {
      if (!inWindow(h.at)) return;
      const base = { key: `a-${a.id}-${i}`, at: h.at, actor: h.actor, href: "#arrivals", kind: "arrival" as const };
      if (h.action === "Recorded arrival") {
        out.push({ ...base, title: `${a.units.toLocaleString("en-US")} × ${p?.name ?? "product"} arrived`, detail: `${a.name} · ${h.detail ?? ""}`.replace(/ · $/, "") });
      } else {
        out.push({ ...base, title: `${h.action} · ${a.name}`, detail: h.detail });
      }
    });
  }

  for (const c of state.stockChanges) {
    if (!inWindow(c.at)) continue;
    const name = product.get(c.productId)?.name ?? "a product";
    out.push({
      key: `c-${c.id}`,
      at: c.at,
      actor: c.actor,
      kind: "stock",
      href: `#history-${c.productId}`,
      title: c.kind === "manual_sale" ? `Logged a sale of ${Math.abs(c.units)} × ${name}` : `Adjusted ${name} by ${c.units > 0 ? "+" : ""}${c.units}`,
      detail: c.note,
    });
  }

  // Derived: a shipment turns late the morning after it was due.
  for (const o of report.orders) {
    for (const inc of o.incoming) {
      if (!inc.late || !inWindow(`${addDays(inc.expectedOn, 1)}T13:00:00.000Z`)) continue;
      out.push({
        key: `late-${o.order.id}-${inc.expectedOn}-${inc.basis}`,
        at: `${addDays(inc.expectedOn, 1)}T13:00:00.000Z`,
        actor: null,
        kind: "late",
        href: `#order-${o.order.id}`,
        title: `${o.order.name} is late`,
        detail: `${inc.units.toLocaleString("en-US")} units were due ${formatDay(inc.expectedOn)} · ${o.supplier?.name ?? "supplier"}`,
      });
    }
  }

  // Derived: the day stock last went from something to nothing.
  for (const r of report.products) {
    if (r.stock > 0) continue;
    const ledger = stockLedger(state, r.product);
    let hit: (typeof ledger)[number] | null = null;
    for (let i = 1; i < ledger.length; i++) {
      if (ledger[i - 1].balance > 0 && ledger[i].balance <= 0) hit = ledger[i];
    }
    if (!hit) continue;
    out.push({
      key: `out-${r.product.id}-${hit.date}`,
      at: hit.at ?? `${hit.date}T23:00:00.000Z`,
      actor: null,
      kind: "out",
      href: `#product-${r.product.id}`,
      title: `${r.product.name} ran out of stock`,
      detail: r.unshipped > 0 ? `${r.unshipped.toLocaleString("en-US")} sold and waiting to ship` : undefined,
    });
  }

  return out
    .filter((x) => inWindow(x.at))
    .sort((a, b) => byTime(b.at, a.at))
    .map((x) => ({ ...x, mine: sameActor(x.actor, me) }));
}

/** Items someone else (or the system) added after `seenAt`. */
export function unread(feed: Activity[], seenAt: Timestamp): Activity[] {
  return feed.filter((x) => !x.mine && x.at > seenAt);
}
