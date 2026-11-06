import { useMemo } from "react";
import { formatDay } from "@/domain/dates";
import type { ProductRow } from "@/domain/report";
import { stockTimeline } from "@/domain/timeline";
import { useApp } from "../context";
import { units } from "../format";
import { StockChart } from "./StockChart";

/**
 * Stock over time for one product: the interactive chart (actual stock to
 * today, then sales at today's pace with deliveries landing on their expected
 * day), plus the deliveries it is waiting for.
 */
export function StockOutlook({ row }: { row: ProductRow }) {
  const { data, report } = useApp();
  const today = report.today;
  const o = row.outlook;
  const timeline = useMemo(() => stockTimeline(data, row, today), [data, row, today]);
  const late = o.incoming.filter((i) => i.late);

  return (
    <div>
      <StockChart timeline={timeline} label={summary(row, today)} />

      {/* The product page already has a callout for a run-out gap; say it once. */}
      {!(row.outlook.runsOutOn && !row.forecast.flags.outOfStock) && <p className="mt-2 text-sm">{summary(row, today)}</p>}
      {o.incoming.length > 0 && (
        <ul className="mt-3 grid gap-1.5 text-sm">
          {o.incoming.map((i, n) => (
            <li key={`${i.orderId}-${n}`} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span>
                <a href={`#order-${i.orderId}`} className="font-mono font-medium hover:underline">
                  {i.orderName}
                </a>{" "}
                <span className="tnum">{units(i.units)} units</span>
              </span>
              <span className={i.late ? "text-st-out" : "text-muted-foreground"}>
                {i.late ? `${i.daysLate} d late, was due ${formatDay(i.expectedOn)}` : `due ${formatDay(i.expectedOn)}`}
                <span className="text-muted-foreground"> · {i.basis === "tracking" ? "ship date + 10 d transit" : "order date + lead time"}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {late.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Late shipments have no reliable date, so the projection leaves them out.</p>}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-foreground/70" /> Stock so far</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-chart" /> Projected at {row.forecast.adjustedBurn} per day</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-st-out-bg ring-1 ring-st-out/30" /> Nothing to sell</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-st-ok" /> Arrival</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-st-urgent" /> Manual change</span>
      </div>
    </div>
  );
}

function summary(row: ProductRow, today: string): string {
  const o = row.outlook;
  if (row.forecast.adjustedBurn <= 0) return "No sales in the last 7 days, so there's nothing to project.";
  if (!o.runsOutOn) {
    return o.incoming.length
      ? `Stock lasts past every delivery in view. Deliveries land before the shelf empties.`
      : `Stock lasts the next ${o.horizon} days at today's pace, with nothing on order.`;
  }
  const g = o.gaps[0];
  const start = o.runsOutOn <= today ? "Out of stock now" : `Runs out ${formatDay(o.runsOutOn)}`;
  if (!o.nextStock) return `${start}, and nothing is on the way.`;
  if (o.nextStock.late) return `${start}. The next stock, ${o.nextStock.orderName} (${units(o.nextStock.units)} units), is ${o.nextStock.daysLate} days late with no new date.`;
  return `${start}. ${o.nextStock.orderName} (${units(o.nextStock.units)} units) is due ${formatDay(o.nextStock.expectedOn)}, leaving ${g.days} days with nothing to sell.`;
}
