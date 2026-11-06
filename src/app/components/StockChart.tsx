import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { RotateCcwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDay, formatWeekday } from "@/domain/dates";
import type { Timeline, TimelineEvent } from "@/domain/timeline";
import { dec1, units } from "../format";

/**
 * Stock over time, interactive: actual stock up to today, projected after.
 * Hover (or touch, or arrow keys) shows the exact day; drag to zoom into a
 * stretch of days; double-click or "Reset" zooms back out.
 */

const RANGES = [
  { id: "2w", label: "2W", days: 14, title: "2 weeks either side of today" },
  { id: "1m", label: "1M", days: 30, title: "1 month either side of today" },
  { id: "3m", label: "3M", days: 90, title: "3 months either side of today" },
  { id: "all", label: "All", days: Infinity, title: "All history and the full projection" },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function niceTicks(max: number): number[] {
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(Math.round(v));
  return out;
}

const fmtChange = (e: TimelineEvent) => {
  const v = Number.isInteger(e.change) ? units(Math.abs(e.change)) : dec1(Math.abs(e.change));
  return e.change > 0 ? `+${v}` : e.change < 0 ? `−${v}` : "±0";
};

export function StockChart({ timeline, label }: { timeline: Timeline; label: string }) {
  const { points, todayIndex } = timeline;
  const n = points.length;
  const [range, setRange] = useState<RangeId>("all");
  const [zoom, setZoom] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(800);

  // Draw at the real width (crisp text, exact pointer mapping): measure now, then on every resize.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const read = () => setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    window.addEventListener("resize", read);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", read);
    };
  }, []);

  const days = RANGES.find((r) => r.id === range)!.days;
  const [lo, hi] = zoom ?? [Math.max(0, todayIndex - days), Math.min(n - 1, todayIndex + days)];
  const span = Math.max(1, hi - lo);

  const H = width < 520 ? 220 : 270;
  const padL = 40;
  const padR = 14;
  const top = 30;
  const bottom = 26;
  const plotW = width - padL - padR;
  const plotH = H - top - bottom;
  const x = (i: number) => padL + ((i - lo) / span) * plotW;

  const visible = points.slice(lo, hi + 1);
  const maxY = Math.max(10, ...visible.map((p) => p.stock)) * 1.15;
  const y = (v: number) => top + (1 - v / maxY) * plotH;
  const yTicks = niceTicks(maxY);

  const path = (from: number, to: number) => {
    let d = "";
    for (let i = from; i <= to; i++) d += `${i === from ? "M" : "L"}${x(i).toFixed(1)},${y(points[i].stock).toFixed(1)}`;
    return d;
  };
  const histEnd = Math.min(hi, todayIndex);
  const hist = lo <= histEnd ? path(lo, histEnd) : "";
  const area = hist ? `${hist} L${x(histEnd).toFixed(1)},${y(0)} L${x(lo).toFixed(1)},${y(0)} Z` : "";
  const projStart = Math.max(lo, todayIndex);
  const proj = projStart < hi ? path(projStart, hi) : "";

  // Runs of projected days without enough stock.
  const gaps = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = lo; i <= hi; i++) {
      if (!points[i].short) continue;
      let j = i;
      while (j + 1 <= hi && points[j + 1].short) j++;
      out.push([i, j]);
      i = j;
    }
    return out;
  }, [points, lo, hi]);

  // Date ticks: about one every 90 px, on whole-day steps counted from today.
  const xTicks = useMemo(() => {
    const raw = span / Math.max(2, Math.floor(plotW / 90));
    const step = [1, 2, 3, 7, 14, 30, 60].find((s) => s >= raw) ?? 90;
    const out: number[] = [];
    for (let i = lo; i <= hi; i++) if ((i - todayIndex) % step === 0 && Math.abs(i - todayIndex) >= step / 2) out.push(i);
    return out;
  }, [lo, hi, span, plotW, todayIndex]);

  const indexAt = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    return clamp(Math.round(lo + ((clientX - r.left - padL) / plotW) * span), lo, hi);
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const i = indexAt(e.clientX);
    setHover(i);
    if (e.pointerType === "mouse" && e.button === 0) {
      setDrag([i, i]);
      svg.current?.setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const i = indexAt(e.clientX);
    setHover(i);
    if (drag) setDrag([drag[0], i]);
  };
  const onPointerUp = () => {
    if (!drag) return;
    const a = Math.min(...drag);
    const b = Math.max(...drag);
    if (b - a >= 2) {
      setZoom([a, b]);
      setHover(null);
    }
    setDrag(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 7 : 1;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      setHover((h) => clamp((h ?? todayIndex) + (e.key === "ArrowRight" ? step : -step), lo, hi));
    } else if (e.key === "Home") setHover(lo);
    else if (e.key === "End") setHover(hi);
    else if (e.key === "Escape") {
      setHover(null);
      setZoom(null);
    } else return;
    e.preventDefault();
  };

  const pickRange = (id: RangeId) => {
    setRange(id);
    setZoom(null);
    setHover(null);
  };

  const p = hover !== null ? points[hover] : null;
  const prev = hover !== null && hover > 0 ? points[hover - 1] : null;
  const tipW = 236;
  const tipLeft = hover !== null ? (x(hover) + 14 + tipW > width ? Math.max(0, x(hover) - 14 - tipW) : x(hover) + 14) : 0;
  const describe = (i: number) => {
    const q = points[i];
    return `${formatWeekday(q.date)}: ${q.projected ? "about " : ""}${units(Math.round(q.stock))} in stock${q.projected ? ", projected" : ""}.`;
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Time range" className="inline-flex rounded-lg border bg-muted/50 p-0.5">
          {RANGES.map((r) => {
            const on = !zoom && range === r.id;
            return (
              <button
                key={r.id}
                type="button"
                title={r.title}
                aria-pressed={on}
                onClick={() => pickRange(r.id)}
                className={cn(
                  "h-7 min-w-10 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  on ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {zoom ? (
            <button
              type="button"
              onClick={() => setZoom(null)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2.5 font-medium text-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <RotateCcwIcon className="size-3.5" /> Reset zoom
            </button>
          ) : (
            <span className="hidden pointer-fine:inline">Drag across the chart to zoom</span>
          )}
          <span className="tnum">
            {formatDay(points[lo].date)} – {formatDay(points[hi].date)}
          </span>
        </div>
      </div>

      <div
        ref={wrap}
        className="relative rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        tabIndex={0}
        role="group"
        aria-label={`${label} Use the arrow keys to move day by day.`}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
      >
        <svg
          ref={svg}
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          className={cn("block max-w-full touch-pan-y select-none", drag ? "cursor-col-resize" : "cursor-crosshair")}
          role="img"
          aria-label={label}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
          onPointerLeave={(e) => e.pointerType === "mouse" && !drag && setHover(null)}
          onDoubleClick={() => setZoom(null)}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="tnum fill-muted-foreground text-[10px]">
                {units(t)}
              </text>
            </g>
          ))}

          {gaps.map(([a, b]) => {
            const x1 = clamp(x(a - 0.5), padL, width - padR);
            const x2 = clamp(x(b + 0.5), padL, width - padR);
            return (
              <g key={a}>
                <rect x={x1} y={top - 4} width={Math.max(2, x2 - x1)} height={plotH + 4} className="fill-st-out-bg" />
                {x2 - x1 > 92 && (
                  <text x={x1 + 6} y={H - bottom - 6} className="fill-st-out text-[10px] font-medium">
                    Nothing to sell{a > lo && b < hi ? ` · ${b - a + 1} d` : ""}
                  </text>
                )}
              </g>
            );
          })}

          {area && <path d={area} className="fill-foreground/[0.06]" />}
          {hist && <path d={hist} fill="none" className="stroke-foreground/75" strokeWidth={1.75} strokeLinejoin="round" />}
          {proj && <path d={proj} fill="none" className="stroke-chart" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />}

          {/* Arrivals and manual changes on the actual line; deliveries due on the projection. */}
          {visible.map((q, k) => {
            const i = lo + k;
            const arrival = q.events.some((e) => e.kind === "arrival");
            const manual = q.events.some((e) => e.kind === "manual_sale" || e.kind === "adjustment");
            const due = q.events.filter((e) => e.kind === "incoming");
            return (
              <g key={q.date}>
                {arrival && <circle cx={x(i)} cy={y(q.stock)} r={4} className="fill-st-ok stroke-card" strokeWidth={1.5} />}
                {manual && <circle cx={x(i)} cy={y(q.stock)} r={3.5} className="fill-st-urgent stroke-card" strokeWidth={1.5} />}
                {due.map((e, m) => (
                  <g key={m}>
                    <line x1={x(i)} x2={x(i)} y1={top - 8} y2={H - bottom} className="stroke-chart" strokeWidth={1} strokeDasharray="2 3" />
                    <text x={x(i)} y={top - 12 - (m % 2) * 11} textAnchor="middle" className="fill-chart text-[10px] font-semibold">
                      {fmtChange(e)} {e.label.replace(" lands", "")}
                    </text>
                  </g>
                ))}
              </g>
            );
          })}

          {todayIndex >= lo && todayIndex <= hi && (
            <g>
              <line x1={x(todayIndex)} x2={x(todayIndex)} y1={top - 8} y2={H - bottom} className="stroke-foreground/60" strokeWidth={1} />
              <text x={x(todayIndex)} y={H - 8} textAnchor="middle" className="fill-foreground text-[10px] font-semibold">
                Today
              </text>
            </g>
          )}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {formatDay(points[i].date)}
            </text>
          ))}

          {drag && Math.abs(drag[1] - drag[0]) > 0 && (
            <rect
              x={x(Math.min(...drag))}
              y={top - 4}
              width={Math.abs(x(drag[1]) - x(drag[0]))}
              height={plotH + 4}
              className="fill-chart/15 stroke-chart/50"
              strokeWidth={1}
            />
          )}

          {p && hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={top - 8} y2={H - bottom} className="stroke-foreground/40" strokeWidth={1} />
              <circle cx={x(hover)} cy={y(p.stock)} r={5} className={cn(p.projected ? "fill-chart" : "fill-foreground", "stroke-card")} strokeWidth={2} />
            </g>
          )}
        </svg>

        {p && hover !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-lg border bg-popover/95 p-2.5 text-xs text-popover-foreground shadow-lg backdrop-blur"
            style={{ left: tipLeft, width: tipW }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{formatWeekday(p.date)}</span>
              <span className="text-muted-foreground">{hover === todayIndex ? "Today" : p.projected ? "Projected" : ""}</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="tnum text-lg leading-none font-semibold">
                {p.projected ? "≈ " : ""}
                {units(Math.round(p.stock))}
              </span>
              <span className="text-muted-foreground">in stock</span>
              {prev && Math.round(p.stock) !== Math.round(prev.stock) && (
                <span className={cn("tnum ml-auto", p.stock > prev.stock ? "text-st-ok" : "text-muted-foreground")}>
                  {p.stock > prev.stock ? "+" : "−"}
                  {units(Math.abs(Math.round(p.stock) - Math.round(prev.stock)))} vs day before
                </span>
              )}
            </div>
            {p.short && <div className="mt-1 font-medium text-st-out">Not enough to cover the day's sales</div>}
            {!p.projected && p.stock <= 0 && <div className="mt-1 font-medium text-st-out">Out of stock</div>}
            {p.events.length > 0 && (
              <ul className="mt-2 grid gap-1 border-t pt-2">
                {p.events.slice(0, 4).map((e, k) => (
                  <li key={k} className="min-w-0">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{e.label}</span>
                      <span className={cn("tnum shrink-0 font-medium", e.change > 0 ? "text-st-ok" : "")}>{fmtChange(e)}</span>
                    </div>
                    {e.detail && <div className="truncate text-muted-foreground">{e.detail}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {hover !== null ? describe(hover) : ""}
        </p>
      </div>
    </div>
  );
}
