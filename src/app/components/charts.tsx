import { useId } from "react";
import { cn } from "@/lib/utils";
import { addDays, formatDay } from "@/domain/dates";
import type { Forecast } from "@/domain/forecast";
import type { OrderProgress } from "@/domain/orders";
import type { StoreDate } from "@/domain/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { dec1, days as fmtDays, units } from "../format";

// ------------------------------------------------------------------ stage bar

/**
 * An order's units by stage, left to right in the order they happen:
 * arrived, on the way, in production, placed. Units that will never come
 * (closed or cancelled) show as an empty dashed tail.
 */
export function StageBar({ p, gone = 0, className, labels = false }: { p: OrderProgress; gone?: number; className?: string; labels?: boolean }) {
  const total = Math.max(1, p.ordered);
  const parts = [
    { key: "arrived", n: Math.min(p.arrived, p.ordered), cls: "bg-sg-arrived", label: "Arrived" },
    { key: "transit", n: p.onTheWay, cls: "bg-sg-transit", label: "On the way" },
    { key: "production", n: p.inProduction, cls: "bg-sg-production", label: "In production" },
    { key: "placed", n: p.placed, cls: "bg-sg-placed", label: "Placed" },
  ].filter((x) => x.n > 0);
  return (
    <div className={cn("w-full", className)}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((x) => (
          <div key={x.key} className={cn("h-full", x.cls)} style={{ width: `${(x.n / total) * 100}%` }} />
        ))}
        {gone > 0 && (
          <div
            className="h-full border border-dashed border-muted-foreground/40 bg-transparent"
            style={{ width: `${(gone / total) * 100}%` }}
          />
        )}
      </div>
      {labels && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {parts.map((x) => (
            <span key={x.key} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-sm", x.cls)} />
              {x.label} <span className="tnum font-medium text-foreground">{units(x.n)}</span>
            </span>
          ))}
          {gone > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm border border-dashed border-muted-foreground/60" />
              Not coming <span className="tnum font-medium text-foreground">{units(gone)}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ coverage

/**
 * Stock runway in days: what's in the warehouse, then what's on order, then
 * (when trying an order) the extra units, against the reorder line
 * (lead time + safety) and the target (lead time + target days).
 */
export function CoverageBar({
  f,
  tryUnits = 0,
  compact = false,
}: {
  f: Forecast;
  tryUnits?: number;
  compact?: boolean;
}) {
  if (f.adjustedBurn <= 0) {
    return <div className="text-xs text-muted-foreground">No sales in the last 7 days, so there is no runway to show.</div>;
  }
  const warehouse = f.stock / f.adjustedBurn;
  const ordered = f.onOrder / f.adjustedBurn;
  const extra = Math.max(0, tryUnits) / f.adjustedBurn;
  const target = f.settings.leadTimeDays + f.settings.targetDays;
  const scale = Math.max(target * 1.15, warehouse + ordered + extra, 30);
  const pct = (d: number) => `${Math.min(100, (d / scale) * 100)}%`;
  const h = compact ? "h-1.5" : "h-3";
  return (
    <div className="w-full">
      <div className={cn("relative w-full rounded-full bg-muted", h)}>
        <div className="absolute inset-0 flex overflow-hidden rounded-full">
          <div className="h-full bg-foreground/80" style={{ width: pct(warehouse) }} />
          <div
            className="h-full bg-[repeating-linear-gradient(135deg,var(--chart)_0_3px,var(--chart-soft)_3px_6px)]"
            style={{ width: pct(ordered) }}
          />
          {extra > 0 && <div className="h-full bg-chart" style={{ width: pct(extra) }} />}
        </div>
        <Marker at={pct(f.reorderLine)} label={compact ? undefined : `Reorder line ${f.reorderLine} d`} tall={!compact} />
        {!compact && <Marker at={pct(target)} label={`Target ${target} d`} tall dashed />}
      </div>
      {!compact && (
        <div className="mt-7 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Legend swatch="bg-foreground/80" label="In warehouse" value={fmtDays(warehouse)} />
          <Legend
            swatch="bg-[repeating-linear-gradient(135deg,var(--chart)_0_2px,var(--chart-soft)_2px_4px)]"
            label="On order"
            value={fmtDays(ordered)}
          />
          {extra > 0 && <Legend swatch="bg-chart" label="This order" value={fmtDays(extra)} />}
        </div>
      )}
    </div>
  );
}

function Marker({ at, label, tall, dashed }: { at: string; label?: string; tall?: boolean; dashed?: boolean }) {
  return (
    <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: at }}>
      <div
        className={cn(
          "w-0 border-l-2",
          dashed ? "border-dashed border-muted-foreground" : "border-st-reorder",
          tall ? "h-6" : "h-3",
        )}
      />
      {label && (
        <div
          className={cn(
            "absolute top-full mt-0.5 -translate-x-1/2 text-[10px] font-medium whitespace-nowrap",
            dashed ? "text-muted-foreground" : "text-st-reorder",
          )}
          style={{ left: "1px" }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm", swatch)} />
      {label} <span className="tnum font-medium text-foreground">{value}</span>
    </span>
  );
}

// ------------------------------------------------------------------ sales chart

/**
 * Daily units for the last `span` days. The 7-day forecast window is split
 * the way the trend factor reads it: prior 4 days vs last 3 days, each with
 * its average drawn across.
 */
export function SalesChart({
  sales,
  today,
  f,
  span = 30,
}: {
  sales: Map<StoreDate, number>;
  today: StoreDate;
  f: Forecast;
  span?: number;
}) {
  const daysList = Array.from({ length: span }, (_, i) => addDays(today, i - span));
  const values = daysList.map((d) => sales.get(d) ?? 0);
  const max = Math.max(1, ...values, f.last3Units / 3, f.prior4Units / 4) * 1.15;
  const W = 600;
  const H = 210;
  const padL = 28;
  const padB = 22;
  const innerW = W - padL;
  const innerH = H - padB - 8;
  const bw = innerW / span;
  const y = (v: number) => 8 + innerH - (v / max) * innerH;
  const ticks = niceTicks(max);
  const prior4From = span - 7;
  const last3From = span - 3;
  const avgLine = (fromIdx: number, n: number, avg: number, cls: string, label: string) => (
    <g>
      <line x1={padL + fromIdx * bw} x2={padL + (fromIdx + n) * bw} y1={y(avg)} y2={y(avg)} className={cls} strokeWidth={2} />
      <text x={padL + (fromIdx + n / 2) * bw} y={y(avg) - 5} textAnchor="middle" className="fill-foreground text-[10px] font-medium">
        {label}
      </text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Units sold per day, last 30 days">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px] tnum">
            {t}
          </text>
        </g>
      ))}
      <rect x={padL + prior4From * bw} y={4} width={7 * bw} height={innerH + 4} className="fill-chart-faint" rx={3} />
      {values.map((v, i) => {
        const inWindow = i >= prior4From;
        const isLast3 = i >= last3From;
        return (
          <Tooltip key={daysList[i]}>
            <TooltipTrigger asChild>
              <rect
                x={padL + i * bw + bw * 0.18}
                y={y(v)}
                width={bw * 0.64}
                height={Math.max(0, innerH + 8 - y(v))}
                rx={1.5}
                className={cn(isLast3 ? "fill-chart" : inWindow ? "fill-chart-soft" : "fill-muted-foreground/25", "outline-none")}
                tabIndex={-1}
              />
            </TooltipTrigger>
            <TooltipContent>
              {formatDay(daysList[i])}: <span className="tnum font-semibold">{units(v)}</span> units
            </TooltipContent>
          </Tooltip>
        );
      })}
      {f.prior4Units > 0 && avgLine(prior4From, 4, f.prior4Units / 4, "stroke-foreground/60", `${dec1(f.prior4Units / 4)}/d`)}
      {avgLine(last3From, 3, f.last3Units / 3, "stroke-foreground", `${dec1(f.last3Units / 3)}/d`)}
      {[0, Math.floor(span / 2), span - 1].map((i) => (
        <text key={i} x={padL + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          {formatDay(daysList[i])}
        </text>
      ))}
    </svg>
  );
}

function niceTicks(max: number): number[] {
  const raw = max / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

// ------------------------------------------------------------------ sparkline

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const id = useId();
  const W = 80;
  const H = 24;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * W, H - 2 - (v / max) * (H - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("h-6 w-20 overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--chart)" stopOpacity={0.25} />
          <stop offset="100%" stopColor="var(--chart)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="var(--chart)" strokeWidth={1.5} strokeLinejoin="round" />
      {last && <circle cx={last[0]} cy={last[1]} r={2} fill="var(--chart)" />}
    </svg>
  );
}
