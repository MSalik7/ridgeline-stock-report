import { useState, type ReactNode } from "react";
import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon, ClipboardCopyIcon, DownloadIcon, PackagePlusIcon, PlusIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { copyStockTable, downloadStockCsv } from "../export";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { daysBetween, formatDay } from "@/domain/dates";
import type { ProductRow } from "@/domain/report";
import { useApp } from "../context";
import { useDialogs } from "../dialogs/DialogProvider";
import { STOCK_DOT, StockBadge } from "../components/badges";
import { CoverageBar, Sparkline } from "../components/charts";
import { PageHeader, go } from "../components/bits";
import { dec1, factor, units } from "../format";
import { TodayPanel } from "./TodayPanel";

type Filter = "all" | "out" | "reorder" | "low" | "gap";

const FILTERS: { value: Filter; label: string; dot?: string; match: (r: ProductRow) => boolean }[] = [
  { value: "all", label: "All products", match: () => true },
  { value: "out", label: "Out of stock", dot: STOCK_DOT.out, match: (r) => r.forecast.flags.outOfStock },
  { value: "reorder", label: "Reorder now", dot: STOCK_DOT.reorder, match: (r) => r.forecast.flags.reorderNow },
  { value: "low", label: "Running low", dot: STOCK_DOT.urgent, match: (r) => r.forecast.flags.low !== null && !r.forecast.flags.outOfStock },
  { value: "gap", label: "Runs out before next delivery", dot: "bg-st-out/60", match: (r) => !!r.outlook.runsOutOn },
];

export function StockView() {
  const { report } = useApp();
  const dialogs = useDialogs();
  const [filter, setFilter] = useState<Filter>("all");
  const rule = FILTERS.find((f) => f.value === filter)!;
  const rows = report.products.filter(rule.match);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Stock"
        description="What needs doing today, then every product: what's in the warehouse, how fast it sells, and when to reorder."
        actions={
          <>
            <Button variant="outline" onClick={() => dialogs.arrival()} title="Record arrival (A)">
              <PackagePlusIcon /> Record arrival
            </Button>
            <Button onClick={() => dialogs.newOrder()} title="New order (N)">
              <PlusIcon /> New order
            </Button>
          </>
        }
      />

      <TodayPanel onChaseAll={() => dialogs.chaseAll()} onPlanReorders={() => dialogs.reorderPlan()} />

      <section aria-labelledby="products-title" className="min-w-0 rounded-xl border surface">
        <div className="grid gap-3 border-b px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="products-title" className="text-sm font-semibold">
              Products <span className="font-normal text-muted-foreground">· worst first</span>
            </h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <DownloadIcon /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void downloadStockCsv(report)}>
                  <DownloadIcon /> Download CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void copyStockTable(report)}>
                  <ClipboardCopyIcon /> Copy as table
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter products">
            {FILTERS.map((f) => {
              const n = report.products.filter(f.match).length;
              const on = filter === f.value;
              if (f.value !== "all" && n === 0) return null;
              return (
                <button
                  key={f.value}
                  aria-pressed={on}
                  onClick={() => setFilter(on && f.value !== "all" ? "all" : f.value)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                    on ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.dot && <span className={cn("size-1.5 rounded-full", f.dot)} />}
                  {f.label}
                  <span className={cn("tnum", on ? "text-background/70" : "text-muted-foreground/70")}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
        <ProductTable rows={rows} />
        <ProductCards rows={rows} />
      </section>
    </div>
  );
}

function Trend({ f }: { f: ProductRow["forecast"] }) {
  const up = f.trendFactor > 1.05;
  const down = f.trendFactor < 0.95;
  const Icon = up ? ArrowUpRightIcon : down ? ArrowDownRightIcon : ArrowRightIcon;
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-xs", up ? "text-st-ok" : down ? "text-st-reorder" : "text-muted-foreground")}
      title={f.rawTrend === null ? "No sales in the prior 4 days, so trend is 1" : "Last 3 days compared with the prior 4 days"}
    >
      <Icon className="size-3.5" />
      {factor(f.trendFactor)}
    </span>
  );
}

/** "Out" for nothing in the warehouse, otherwise days of stock. */
export function daysLeft(r: ProductRow) {
  const f = r.forecast;
  if (f.flags.outOfStock) return "Out";
  return f.daysOfStock === null ? "—" : `${dec1(f.daysOfStock)} d`;
}

/**
 * The SOP's reorder-by date, worded by what it means for this product.
 * It only shows as a problem when the product is actually flagged
 * "Reorder now"; open orders often cover a date that has passed.
 */
export function ReorderBy({ r, compact = false }: { r: ProductRow; compact?: boolean }) {
  const { report } = useApp();
  const f = r.forecast;
  const d = f.reorderBy;
  if (!d) return <span className="text-muted-foreground">{compact ? "—" : "No recent sales"}</span>;
  const n = daysBetween(report.today, d);
  if (f.flags.reorderNow) {
    return (
      <div className="text-st-reorder">
        <div className="tnum font-medium">{f.flags.outOfStock || n <= 0 ? "Now" : formatDay(d)}</div>
        {!compact && <div className="text-xs">{n < 0 ? `due ${formatDay(d)}, ${-n} d ago` : n === 0 ? "today" : `in ${n} d`}</div>}
      </div>
    );
  }
  if (n < 0) {
    return (
      <div className="text-muted-foreground">
        <div>Covered</div>
        {!compact && <div className="text-xs">by open orders</div>}
      </div>
    );
  }
  return (
    <div>
      <div className="tnum">{formatDay(d)}</div>
      {!compact && <div className="text-xs text-muted-foreground">in {n} d</div>}
    </div>
  );
}

/** Red note when stock runs out before the next delivery lands. */
export function GapNote({ r, className }: { r: ProductRow; className?: string }) {
  const { report } = useApp();
  const o = r.outlook;
  if (!o.runsOutOn) return null;
  const g = o.gaps[0];
  const from = o.runsOutOn <= report.today ? "Out now" : `Out ${formatDay(o.runsOutOn)}`;
  const text = !o.nextStock
    ? `${from}, nothing due`
    : o.nextStock.late
      ? `${from}, ${o.nextStock.orderName} ${o.nextStock.daysLate} d late`
      : `${from}–${formatDay(o.nextStock.expectedOn)}${g.days ? ` (${g.days} d)` : ""}`;
  return <div className={cn("text-xs font-medium text-st-out", className)}>{text}</div>;
}

function last14(r: ProductRow, today: string) {
  const out: number[] = [];
  for (let i = 14; i >= 1; i--) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(r.sales.get(d.toISOString().slice(0, 10)) ?? 0);
  }
  return out;
}

function ProductTable({ rows }: { rows: ProductRow[] }) {
  const { report } = useApp();
  return (
    <div className="hidden overflow-x-auto xl:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-medium">
            <th className="pl-4">Product</th>
            <th>Status</th>
            <th className="text-right" title="Physical units in the warehouse now">In warehouse</th>
            <th className="text-right" title="Sold to customers, not yet shipped">Not shipped</th>
            <th title="Adjusted burn: last 7 days, weighted by the last-3 vs prior-4 trend">Sells per day</th>
            <th className="min-w-40" title="Warehouse stock divided by sales per day">Days of stock</th>
            <th className="text-right" title="Placed + in production + on the way, and the days of stock counting them">On order</th>
            <th>Reorder by</th>
            <th className="pr-4 text-right" title="(target + lead time) × sales per day − warehouse stock">Suggested</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const f = r.forecast;
            return (
              <tr
                key={r.product.id}
                onClick={() => go(`product-${r.product.id}`)}
                className="cursor-pointer border-b last:border-0 hover:bg-accent/40 [&>td]:px-3 [&>td]:py-3 [&>td]:align-top"
              >
                <td className="pl-4">
                  <a href={`#product-${r.product.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                    {r.product.name}
                  </a>
                  <div className="font-mono text-xs text-muted-foreground">{r.product.code}</div>
                </td>
                <td>
                  <StockBadge status={f.status} />
                  {f.flags.orderedNotEnough && <div className="mt-1 text-[11px] text-st-reorder">Even with open orders</div>}
                </td>
                <td className={cn("tnum text-right font-medium", f.flags.outOfStock && "text-st-out")}>{units(r.stock)}</td>
                <td className="tnum text-right text-muted-foreground">{units(r.unshipped)}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="tnum font-medium">{dec1(f.adjustedBurn)}</div>
                      <Trend f={f} />
                    </div>
                    <Sparkline values={last14(r, report.today)} className="hidden 2xl:block" />
                  </div>
                </td>
                <td>
                  <div className={cn("tnum font-medium", f.flags.outOfStock && "text-st-out")}>{daysLeft(r)}</div>
                  {r.outlook.runsOutOn ? (
                    <GapNote r={r} />
                  ) : (
                    <div className="text-xs text-muted-foreground">{f.sellsOutOn ? `Sells out ${formatDay(f.sellsOutOn)}` : "No recent sales"}</div>
                  )}
                  <div className="mt-1.5 w-36">
                    <CoverageBar f={f} compact />
                  </div>
                </td>
                <td className="text-right">
                  <div className="tnum">{units(f.onOrder)}</div>
                  <div className={cn("tnum text-xs", f.flags.reorderNow ? "text-st-reorder" : "text-muted-foreground")}>
                    {f.daysWithOrdered === null ? "—" : `${dec1(f.daysWithOrdered)} d total`}
                  </div>
                </td>
                <td>
                  <ReorderBy r={r} />
                </td>
                <td className="tnum pr-4 text-right font-medium">{f.suggestedOrder ? units(f.suggestedOrder) : <span className="text-muted-foreground">0</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProductCards({ rows }: { rows: ProductRow[] }) {
  return (
    <ul className="grid gap-3 p-3 sm:grid-cols-2 xl:hidden">
      {rows.map((r) => {
        const f = r.forecast;
        return (
          <li key={r.product.id}>
            <a href={`#product-${r.product.id}`} className="block h-full rounded-lg border px-3.5 py-3 transition-colors hover:bg-accent/40 active:bg-accent/60">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.product.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.product.code}</div>
                </div>
                <StockBadge status={f.status} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <Mini label="In warehouse" value={units(r.stock)} />
                <Mini label="Days left" value={<span className={cn(f.flags.outOfStock && "text-st-out")}>{daysLeft(r)}</span>} />
                <Mini label="Sells/day" value={<>{dec1(f.adjustedBurn)} <Trend f={f} /></>} />
              </div>
              <div className="mt-3">
                <CoverageBar f={f} compact />
              </div>
              <GapNote r={r} className="mt-2" />
              <div className="mt-2 flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
                <span className={cn(f.flags.reorderNow && "text-st-reorder")}>
                  {units(f.onOrder)} on order · {f.daysWithOrdered === null ? "—" : `${dec1(f.daysWithOrdered)} d`} total
                </span>
                <span className="flex items-center gap-1">
                  Reorder by <ReorderBy r={r} compact />
                </span>
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
                <span>{units(r.unshipped)} sold, not shipped</span>
                {f.suggestedOrder > 0 && <span>Suggest {units(f.suggestedOrder)}</span>}
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div>{label}</div>
      <div className="tnum mt-0.5 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
