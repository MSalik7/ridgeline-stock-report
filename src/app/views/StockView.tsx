import { useState, type ReactNode } from "react";
import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon, PackagePlusIcon, PlusIcon, TruckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { daysBetween, formatDay } from "@/domain/dates";
import type { StockStatus } from "@/domain/forecast";
import { CHASE_LABEL } from "@/domain/orders";
import type { ProductRow } from "@/domain/report";
import { useApp } from "../context";
import { useDialogs } from "../dialogs/DialogProvider";
import { StockBadge } from "../components/badges";
import { CoverageBar, Sparkline } from "../components/charts";
import { PageHeader, Panel, go } from "../components/bits";
import { dec1, days as fmtDays, factor, plural, units } from "../format";

type Filter = "all" | "attention" | StockStatus;

export function StockView() {
  const { report } = useApp();
  const dialogs = useDialogs();
  const [filter, setFilter] = useState<Filter>("all");
  const { counts } = report;

  const rows = report.products.filter((r) => {
    const s = r.forecast.status;
    if (filter === "all") return true;
    if (filter === "attention") return s === "out" || s === "reorder" || s === "urgent";
    if (filter === "urgent") return r.forecast.flags.low !== null && !r.forecast.flags.outOfStock;
    if (filter === "reorder") return r.forecast.flags.reorderNow;
    return s === filter;
  });

  const names = (pred: (r: ProductRow) => boolean) =>
    report.products
      .filter(pred)
      .map((r) => r.product.code)
      .join(", ");

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Stock"
        description="What's in the warehouse, how fast it sells, and what to reorder. Worst first."
        actions={
          <>
            <Button variant="outline" onClick={() => dialogs.arrival()}>
              <PackagePlusIcon /> Record arrival
            </Button>
            <Button onClick={() => dialogs.newOrder()}>
              <PlusIcon /> New order
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
        <Tile
          active={filter === "out"}
          onClick={() => setFilter(filter === "out" ? "all" : "out")}
          n={counts.out}
          label="Out of stock"
          detail={names((r) => r.forecast.flags.outOfStock) || "None"}
          tone="out"
        />
        <Tile
          active={filter === "reorder"}
          onClick={() => setFilter(filter === "reorder" ? "all" : "reorder")}
          n={counts.reorder}
          label="Reorder now"
          detail={names((r) => r.forecast.flags.reorderNow) || "Nothing below the reorder line"}
          tone="reorder"
        />
        <Tile
          active={filter === "urgent"}
          onClick={() => setFilter(filter === "urgent" ? "all" : "urgent")}
          n={counts.low}
          label="Running low"
          detail={
            report.products
              .filter((r) => r.forecast.flags.low && !r.forecast.flags.outOfStock)
              .map((r) => `${r.product.code} ${r.forecast.flags.low === "urgent" ? "<21d" : "<45d"}`)
              .join(", ") || "Everything above 45 days"
          }
          tone="urgent"
        />
        <Tile
          onClick={() => go("orders-chase")}
          n={counts.chase}
          label="Orders to chase"
          detail={report.chaseDue.map((a) => report.orderById.get(a.orderId)?.order.name).join(", ") || "All suppliers on track"}
          tone="neutral"
          link
        />
        <Tile
          onClick={() => go("arrivals")}
          n={counts.unmatched}
          label="Unmatched arrivals"
          detail={report.unmatchedArrivals.map((u) => `${u.arrival.name} (${u.units})`).join(", ") || "Everything matched"}
          tone="neutral"
          link
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <section className="min-w-0 rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            Products <span className="font-normal text-muted-foreground">· {rows.length} shown</span>
          </h2>
          {filter !== "all" && (
            <Button variant="ghost" size="sm" onClick={() => setFilter("all")}>
              Show all products
            </Button>
          )}
        </div>
        <ProductTable rows={rows} />
        <ProductCards rows={rows} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChasePanel />
        <UnmatchedPanel />
      </div>
    </div>
  );
}

function Tile({
  n,
  label,
  detail,
  tone,
  onClick,
  active,
  link,
  className,
}: {
  n: number;
  label: string;
  detail: string;
  tone: "out" | "reorder" | "urgent" | "neutral";
  onClick: () => void;
  active?: boolean;
  link?: boolean;
  className?: string;
}) {
  const on = n > 0;
  const color = {
    out: "text-st-out",
    reorder: "text-st-reorder",
    urgent: "text-st-urgent",
    neutral: "text-foreground",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={link ? undefined : active}
      className={cn(
        "group relative flex min-w-0 flex-col items-start gap-0.5 rounded-xl border bg-card p-3 text-left sm:gap-1 sm:p-4 transition-colors hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        active && "border-foreground/40 bg-accent/60",
        className,
      )}
    >
      <div className="flex w-full items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        {label}
        {link && <ArrowRightIcon className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />}
      </div>
      <div className={cn("tnum text-2xl font-semibold tracking-tight sm:text-3xl", on ? color : "text-muted-foreground/60")}>{n}</div>
      <div className="w-full truncate text-xs text-muted-foreground" title={detail}>
        {detail}
      </div>
    </button>
  );
}

function Trend({ f }: { f: ProductRow["forecast"] }) {
  const up = f.trendFactor > 1.05;
  const down = f.trendFactor < 0.95;
  const Icon = up ? ArrowUpRightIcon : down ? ArrowDownRightIcon : ArrowRightIcon;
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-xs", up ? "text-st-ok" : down ? "text-st-reorder" : "text-muted-foreground")}
      title={f.rawTrend === null ? "No sales in the prior 4 days, so trend is 1" : `Last 3 days vs prior 4 days`}
    >
      <Icon className="size-3.5" />
      {factor(f.trendFactor)}
    </span>
  );
}

function ReorderBy({ r }: { r: ProductRow }) {
  const { report } = useApp();
  const d = r.forecast.reorderBy;
  if (!d) return <span className="text-muted-foreground">—</span>;
  const n = daysBetween(report.today, d);
  return (
    <div>
      <div className="tnum">{formatDay(d)}</div>
      <div className={cn("text-xs", n < 0 ? "text-st-reorder" : "text-muted-foreground")}>
        {n < 0 ? `${-n} d overdue` : n === 0 ? "today" : `in ${n} d`}
      </div>
    </div>
  );
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
            <th className="text-right">In warehouse</th>
            <th className="text-right">Not shipped</th>
            <th>Sells per day</th>
            <th className="min-w-36">Days of stock</th>
            <th className="text-right">On order</th>
            <th>Reorder by</th>
            <th className="pr-4 text-right">Suggested</th>
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
                  {f.flags.orderedNotEnough && <div className="mt-1 text-[11px] text-st-reorder">Even with orders</div>}
                </td>
                <td className="tnum text-right font-medium">{units(r.stock)}</td>
                <td className="tnum text-right text-muted-foreground">{units(r.unshipped)}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="tnum font-medium">{dec1(f.adjustedBurn)}</div>
                      <Trend f={f} />
                    </div>
                    <Sparkline values={last14(r, report.today)} className="hidden xl:block" />
                  </div>
                </td>
                <td>
                  <div className="tnum font-medium">{fmtDays(f.daysOfStock)}</div>
                  <div className="text-xs text-muted-foreground">{f.sellsOutOn ? `Sells out ${formatDay(f.sellsOutOn)}` : "No recent sales"}</div>
                  <div className="mt-1.5 w-32">
                    <CoverageBar f={f} compact />
                  </div>
                </td>
                <td className="text-right">
                  <div className="tnum">{units(f.onOrder)}</div>
                  <div className={cn("tnum text-xs", f.flags.reorderNow ? "text-st-reorder" : "text-muted-foreground")}>
                    {fmtDays(f.daysWithOrdered)} total
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
                <Mini label="Days left" value={fmtDays(f.daysOfStock)} />
                <Mini label="Sells/day" value={<>{dec1(f.adjustedBurn)} <Trend f={f} /></>} />
              </div>
              <div className="mt-3">
                <CoverageBar f={f} compact />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
                <span className={cn(f.flags.reorderNow && "text-st-reorder")}>
                  {units(f.onOrder)} on order · {fmtDays(f.daysWithOrdered)} total
                </span>
                {f.reorderBy && <span>Reorder by {formatDay(f.reorderBy)}</span>}
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

function ChasePanel() {
  const { report } = useApp();
  const dialogs = useDialogs();
  return (
    <Panel
      title={<>Supplier orders to chase</>}
      description="Follow-ups repeat at most every 2 days while the reason still applies."
      action={
        <Button variant="ghost" size="sm" asChild>
          <a href="#orders-chase">All</a>
        </Button>
      }
      bodyClassName="p-0"
    >
      {report.chaseDue.length === 0 && report.chaseWaiting.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">No supplier order needs chasing.</p>
      )}
      <ul className="divide-y">
        {report.chaseDue.map((a) => {
          const o = report.orderById.get(a.orderId)!;
          return (
            <li key={`${a.orderId}-${a.kind}`} className="flex items-center gap-3 px-4 py-3">
              <TruckIcon className="size-4 shrink-0 text-st-reorder" />
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <a className="font-mono font-medium hover:underline" href={`#order-${a.orderId}`}>
                    {o.order.name}
                  </a>{" "}
                  <span className="text-muted-foreground">· {o.supplier?.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">{a.reason}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => dialogs.chase(a.orderId, a.kind)}>
                {CHASE_LABEL[a.kind]}
              </Button>
            </li>
          );
        })}
        {report.chaseWaiting.map((a) => {
          const o = report.orderById.get(a.orderId)!;
          return (
            <li key={`${a.orderId}-${a.kind}-w`} className="flex items-center gap-3 px-4 py-3 text-muted-foreground">
              <TruckIcon className="size-4 shrink-0" />
              <div className="min-w-0 flex-1 text-sm">
                <a className="font-mono font-medium text-foreground hover:underline" href={`#order-${a.orderId}`}>
                  {o.order.name}
                </a>{" "}
                · {CHASE_LABEL[a.kind]} sent, due again {a.nextDueOn ? formatDay(a.nextDueOn) : "soon"}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function UnmatchedPanel() {
  const { report, data } = useApp();
  const dialogs = useDialogs();
  return (
    <Panel
      title="Arrivals not matched to an order"
      description="Units in stock that no supplier order explains. Match them or mark them as not from an order."
      bodyClassName="p-0"
    >
      {report.unmatchedArrivals.length === 0 && <p className="p-4 text-sm text-muted-foreground">Every arrival is matched.</p>}
      <ul className="divide-y">
        {report.unmatchedArrivals.map(({ arrival, units: n }) => {
          const p = data.products.find((x) => x.id === arrival.productId);
          return (
            <li key={arrival.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className="font-mono font-medium">{arrival.name}</span> · {p?.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {plural(n, "unit")} unmatched · received {formatDay(arrival.receivedOn)}
                  {arrival.note ? ` · ${arrival.note}` : ""}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => dialogs.match(arrival.id)}>
                Match
              </Button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
