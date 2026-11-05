/**
 * Planning reorders as a batch. "Due now" is the SOP's Reorder now flag.
 * "Due soon" is the same rule looked forward: days with everything ordered
 * drops by one each day, so it crosses the reorder line in
 * (days with everything ordered - reorder line) days. Ordering those
 * together with what's due now means fewer, fuller shipments per supplier.
 * They start unticked: ordering early is a choice, not a rule.
 */
import { addDays } from "./dates";
import type { ProductRow, Report } from "./report";
import type { StoreDate } from "./types";

/** A month ahead: far enough to batch with what is due now, near enough not to tie up cash early. */
export const DUE_SOON_DAYS = 30;

export interface PlanLine {
  row: ProductRow;
  due: "now" | "soon";
  /** Day it crosses the reorder line (today or earlier for "now"). */
  dueOn: StoreDate;
  /** SOP suggested order. */
  units: number;
}

export function reorderPlan(report: Report, soonDays = DUE_SOON_DAYS): PlanLine[] {
  const out: PlanLine[] = [];
  for (const row of report.products) {
    const f = row.forecast;
    if (f.daysWithOrdered === null) continue;
    const left = f.daysWithOrdered - f.reorderLine;
    if (f.flags.reorderNow) {
      out.push({ row, due: "now", dueOn: addDays(report.today, Math.min(0, Math.floor(left))), units: f.suggestedOrder });
    } else if (left < soonDays) {
      out.push({ row, due: "soon", dueOn: addDays(report.today, Math.floor(left)), units: f.suggestedOrder });
    }
  }
  return out.sort((a, b) => (a.due === b.due ? a.dueOn.localeCompare(b.dueOn) : a.due === "now" ? -1 : 1));
}
