import { useMemo } from "react";
import { addDays, daysBetween, formatDay } from "@/domain/dates";
import type { ProductRow } from "@/domain/report";
import { stockLedger } from "@/domain/stock";
import { useApp } from "../context";
import { units } from "../format";

const PAST_DAYS = 30;

/** End-of-day stock for the last `n` days, from the stock ledger. */
function history(rows: ReturnType<typeof stockLedger>, today: string, n: number) {
  const out: { date: string; stock: number }[] = [];
  let i = 0;
  let balance = 0;
  for (let k = -n; k <= 0; k++) {
    const d = addDays(today, k);
    while (i < rows.length && rows[i].date <= d) balance = rows[i++].balance;
    out.push({ date: d, stock: balance });
  }
  return out;
}

/**
 * Past stock, then the projection: sales at today's pace, deliveries landing
 * on their expected day, and red bands wherever there'd be nothing to sell.
 */
export function StockOutlook({ row }: { row: ProductRow }) {
  const { data, report } = useApp();
  const today = report.today;
  const o = row.outlook;
  const past = useMemo(() => history(stockLedger(data, row.product), today, PAST_DAYS), [data, row.product, today]);
  const future = o.projection;
  const onTime = o.incoming.filter((i) => !i.late);
  const late = o.incoming.filter((i) => i.late);

  const W = 900;
  const H = 240;
  const padL = 40;
  const padR = 12;
  const top = 34;
  const bottom = 24;
  const total = PAST_DAYS + o.horizon;
  const x = (dayOffset: number) => padL + ((dayOffset + PAST_DAYS) / total) * (W - padL - padR);
  const maxY = Math.max(10, ...past.map((p) => p.stock), ...future.map((p) => p.stock)) * 1.12;
  const y = (v: number) => top + (1 - v / maxY) * (H - top - bottom);
  const ticks = niceTicks(maxY);

  const line = (pts: { date: string; stock: number }[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(daysBetween(today, p.date)).toFixed(1)},${y(p.stock).toFixed(1)}`).join(" ");
  const pastPath = line(past);
  const futurePath = line([{ date: today, stock: row.stock }, ...future.slice(1)]);
  const area = `${pastPath} L${x(0).toFixed(1)},${y(0)} L${x(-PAST_DAYS).toFixed(1)},${y(0)} Z`;

  const monthTicks: number[] = [];
  for (let k = -PAST_DAYS; k <= o.horizon; k++) if (addDays(today, k).endsWith("-01")) monthTicks.push(k);

  return (
    <div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[34rem]" role="img" aria-label={summary(row, today)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px] tnum">
                {units(t)}
              </text>
            </g>
          ))}

          {o.gaps.map((g) => {
            const a = daysBetween(today, g.from);
            const b = g.to ? daysBetween(today, g.to) : o.horizon;
            return (
              <g key={g.from}>
                <rect x={x(a)} y={top - 4} width={Math.max(2, x(b) - x(a))} height={H - top - bottom + 4} className="fill-st-out-bg" />
                <text x={x(a) + 4} y={H - bottom - 6} className="fill-st-out text-[10px] font-medium">
                  Nothing to sell{g.days ? ` · ${g.days} d` : ""}
                </text>
              </g>
            );
          })}

          <path d={area} className="fill-foreground/[0.06]" />
          <path d={pastPath} fill="none" className="stroke-foreground/70" strokeWidth={1.75} strokeLinejoin="round" />
          <path d={futurePath} fill="none" className="stroke-chart" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />

          {onTime.map((i, n) => {
            const k = Math.max(1, daysBetween(today, i.expectedOn));
            if (k > o.horizon) return null;
            return (
              <g key={`${i.orderId}-${i.expectedOn}-${n}`}>
                <line x1={x(k)} x2={x(k)} y1={top - 10} y2={H - bottom} className="stroke-chart" strokeWidth={1} strokeDasharray="2 3" />
                <text x={x(k)} y={top - 14 - (n % 2) * 11} textAnchor="middle" className="fill-chart text-[10px] font-semibold">
                  +{units(i.units)} {i.orderName}
                </text>
              </g>
            );
          })}

          <line x1={x(0)} x2={x(0)} y1={top - 10} y2={H - bottom} className="stroke-foreground" strokeWidth={1} />
          <circle cx={x(0)} cy={y(row.stock)} r={3.5} className="fill-foreground" />
          <text x={x(0) + 5} y={H - 6} className="fill-foreground text-[10px] font-medium">
            Today
          </text>
          {monthTicks.map((k) => (
            <text key={k} x={x(k)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {formatDay(addDays(today, k)).split(" ")[0]}
            </text>
          ))}
        </svg>
      </div>

      <p className="mt-2 text-sm">{summary(row, today)}</p>
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

function niceTicks(max: number): number[] {
  const raw = max / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(Math.round(v));
  return out;
}
