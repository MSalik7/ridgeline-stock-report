import { useState, type ReactNode } from "react";
import { ArrowLeftIcon, ClipboardPenIcon, PackagePlusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addDays, daysBetween, formatDay, formatWeekday } from "@/domain/dates";
import { LOW_URGENT_DAYS, LOW_WATCH_DAYS, tryOrderDays } from "@/domain/forecast";
import type { ProductRow } from "@/domain/report";
import { LEDGER_LABEL, stockLedger } from "@/domain/stock";
import { useApp } from "../context";
import { useDialogs } from "../dialogs/DialogProvider";
import { OrderBadge, StockBadge } from "../components/badges";
import { CoverageBar, SalesChart, StageBar } from "../components/charts";
import { PageHeader, Panel, Stat, UnitsInput, toInt } from "../components/bits";
import { StockOutlook } from "../components/outlook";
import { dec1, days as fmtDays, factor, units } from "../format";

export function ProductView({ id }: { id: string }) {
  const { report } = useApp();
  const row = report.products.find((r) => r.product.id === id);
  if (!row) {
    return (
      <div className="grid gap-4">
        <a href="#stock" className="text-sm text-muted-foreground hover:underline">
          ← Stock
        </a>
        <p>That product doesn't exist anymore.</p>
      </div>
    );
  }
  return <Product row={row} />;
}

function Product({ row }: { row: ProductRow }) {
  const { report } = useApp();
  const dialogs = useDialogs();
  const f = row.forecast;
  const p = row.product;
  const today = report.today;
  const reorderIn = f.reorderBy ? daysBetween(today, f.reorderBy) : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={
          <a href="#stock" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeftIcon className="size-3.5" /> Stock
          </a>
        }
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {p.name} <StockBadge status={f.status} />
          </span>
        }
        description={
          <>
            <span className="font-mono">{p.code}</span> · {row.supplier?.name ?? "No supplier"} · sells as{" "}
            {p.identifiers.map((i) => `${i.sku}${i.unitsPerSale > 1 ? ` (${i.unitsPerSale} units)` : ""}`).join(", ")}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => dialogs.stockChange(p.id)}>
              <ClipboardPenIcon /> Log change
            </Button>
            <Button variant="outline" onClick={() => dialogs.arrival({ productId: p.id })}>
              <PackagePlusIcon /> Arrival
            </Button>
            <Button onClick={() => dialogs.newOrder({ productId: p.id, units: f.suggestedOrder || undefined })}>
              <PlusIcon /> New order
            </Button>
          </>
        }
      />

      <Callouts row={row} />

      <div className="grid grid-cols-2 gap-x-4 gap-y-5 rounded-xl border surface p-4 sm:grid-cols-4 2xl:grid-cols-8">
        <Stat label="In warehouse" value={units(row.stock)} hint="Physical stock now" tone={f.flags.outOfStock ? "out" : undefined} />
        <Stat label="Sold, not shipped" value={units(row.unshipped)} hint={row.unshipped > row.stock ? "More than in stock: backorders" : "Waiting to ship"} />
        <Stat label="Sells per day" value={dec1(f.adjustedBurn)} hint={<>Trend {factor(f.trendFactor)}</>} />
        <Stat
          label="Days of stock"
          value={f.flags.outOfStock ? "Out" : fmtDays(f.daysOfStock, "")}
          hint={f.flags.outOfStock ? "Nothing in the warehouse" : f.flags.low === "urgent" ? "Under 21: urgent" : f.flags.low === "watch" ? "Under 45: watch" : "Warehouse only"}
          tone={f.flags.outOfStock ? "out" : f.flags.low === "urgent" ? "urgent" : f.flags.low === "watch" ? "watch" : undefined}
        />
        <Stat
          label="With everything ordered"
          value={fmtDays(f.daysWithOrdered, "")}
          hint={`Reorder line ${f.reorderLine}`}
          tone={f.flags.reorderNow ? "reorder" : undefined}
        />
        <Stat label="Sells out on" value={f.sellsOutOn ? formatDay(f.sellsOutOn) : "—"} hint={f.sellsOutOn ? formatWeekday(f.sellsOutOn).split(",")[0] : "No recent sales"} />
        <Stat
          label="Reorder by"
          value={!f.reorderBy ? "—" : f.flags.reorderNow ? (f.flags.outOfStock || (reorderIn ?? 0) <= 0 ? "Now" : formatDay(f.reorderBy)) : (reorderIn ?? 0) < 0 ? "Covered" : formatDay(f.reorderBy)}
          hint={
            reorderIn === null
              ? "No recent sales"
              : f.flags.reorderNow
                ? reorderIn < 0 ? `Was due ${formatDay(f.reorderBy!)}` : reorderIn === 0 ? "Today" : `In ${reorderIn} days`
                : reorderIn < 0 ? "Open orders cover it" : `In ${reorderIn} days`
          }
          tone={f.flags.reorderNow ? "reorder" : undefined}
        />
        <Stat label="Suggested order" value={units(f.suggestedOrder)} hint={row.forecast.onOrder ? `${units(f.onOrder)} already on order` : "Nothing on order"} />
      </div>

      <Panel
        title="Stock outlook"
        description="When open orders should land, and whether the shelf empties first. Sales continue at today's pace."
      >
        <StockOutlook row={row} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-5">
        <TryOrder row={row} className="lg:col-span-3" />
        <Panel title="Supplier orders" className="lg:col-span-2" bodyClassName="p-0" action={<Button variant="ghost" size="sm" asChild><a href="#orders">All orders</a></Button>}>
          <ProductOrders row={row} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel
          title="Units sold per day"
          description={`Last 30 days. The shaded week (${formatDay(f.window.from)}–${formatDay(f.window.to)}) is what the forecast uses; today isn't finished, so it's left out.`}
          className="lg:col-span-3"
        >
          <SalesChart sales={row.sales} today={today} f={f} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-soft" /> Prior 4 days</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart" /> Last 3 days</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-foreground" /> Daily average</span>
          </div>
        </Panel>
        <Workings row={row} className="lg:col-span-2" />
      </div>

      <RecentHistory row={row} />
    </div>
  );
}

function Callouts({ row }: { row: ProductRow }) {
  const f = row.forecast;
  const items: { tone: string; title: string; body: ReactNode }[] = [];
  if (f.flags.outOfStock) {
    items.push({
      tone: "border-st-out/40 bg-st-out-bg text-st-out",
      title: "Out of stock",
      body: (
        <>
          Nothing in the warehouse. {row.unshipped > 0 ? `${units(row.unshipped)} units are sold and waiting to ship. ` : ""}
          {row.onTheWay > 0 ? `${units(row.onTheWay)} are on the way.` : "Nothing is on the way."}
        </>
      ),
    });
  }
  if (f.flags.reorderNow) {
    items.push({
      tone: "border-st-reorder/40 bg-st-reorder-bg text-st-reorder",
      title: f.flags.orderedNotEnough ? "Reorder now, even counting open orders" : "Reorder now",
      body: f.flags.orderedNotEnough ? (
        <>
          With the {units(f.onOrder)} units already on order, stock lasts {fmtDays(f.daysWithOrdered, " days")}. That's under the{" "}
          {f.reorderLine}-day reorder line (lead time {f.settings.leadTimeDays} + safety {f.settings.safetyDays}). The open orders aren't enough.
        </>
      ) : (
        <>
          Stock lasts {fmtDays(f.daysWithOrdered, " days")} and nothing is on order. That's under the {f.reorderLine}-day reorder line.
        </>
      ),
    });
  }
  if (f.flags.low && !f.flags.outOfStock) {
    items.push({
      tone: f.flags.low === "urgent" ? "border-st-urgent/40 bg-st-urgent-bg text-st-urgent" : "border-st-watch/30 bg-st-watch-bg text-st-watch",
      title: f.flags.low === "urgent" ? "Running low: urgent" : "Running low: watch",
      body: (
        <>
          {fmtDays(f.daysOfStock, " days")} of stock in the warehouse, under {f.flags.low === "urgent" ? LOW_URGENT_DAYS : LOW_WATCH_DAYS} days.
          {!f.flags.reorderNow && f.onOrder > 0 ? ` Open orders cover ${fmtDays(f.daysWithOrdered, " days")} in total, so no reorder is needed yet.` : ""}
        </>
      ),
    });
  }
  const o = row.outlook;
  if (o.runsOutOn && !f.flags.outOfStock) {
    const g = o.gaps[0];
    items.push({
      tone: "border-st-out/30 bg-st-out-bg text-st-out",
      title: "Runs out before the next delivery",
      body: !o.nextStock ? (
        <>Stock runs out {formatDay(o.runsOutOn)} and nothing is on the way.</>
      ) : o.nextStock.late ? (
        <>Stock runs out {formatDay(o.runsOutOn)}. The next stock, {o.nextStock.orderName}, is {o.nextStock.daysLate} days late.</>
      ) : (
        <>
          Stock runs out {formatDay(o.runsOutOn)}, but {o.nextStock.orderName} isn't due until {formatDay(o.nextStock.expectedOn)}: {g.days} days with nothing to
          sell. Ask the supplier to ship early, or place a faster order.
        </>
      ),
    });
  }
  if (!items.length) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((i) => (
        <div key={i.title} className={cn("rounded-xl border px-4 py-3", i.tone)}>
          <div className="text-sm font-semibold">{i.title}</div>
          <div className="mt-0.5 text-sm text-foreground/80">{i.body}</div>
        </div>
      ))}
    </div>
  );
}

function TryOrder({ row, className }: { row: ProductRow; className?: string }) {
  const { report } = useApp();
  const dialogs = useDialogs();
  const f = row.forecast;
  const [text, setText] = useState(f.suggestedOrder ? String(f.suggestedOrder) : "");
  const n = toInt(text);
  const valid = Number.isFinite(n) && n >= 0;
  const result = valid ? tryOrderDays(f, n) : null;
  return (
    <Panel
      title="Try an order"
      description="Type units to see the days of stock you'd have. Nothing is saved."
      className={className}
    >
      {f.adjustedBurn <= 0 ? (
        <p className="text-sm text-muted-foreground">No sales in the last 7 days, so days of stock can't be worked out.</p>
      ) : (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="try-units" className="text-xs text-muted-foreground">
                Units to order today
              </label>
              <UnitsInput id="try-units" value={text} onChange={setText} className="h-10 w-36 text-base" />
            </div>
            <div className="flex flex-wrap gap-1.5 pb-0.5">
              {[f.suggestedOrder, 250, 500, 1000]
                .filter((x, i, a) => x > 0 && a.indexOf(x) === i)
                .map((x, i) => (
                  <Button key={x} type="button" variant="secondary" size="sm" onClick={() => setText(String(x))}>
                    {i === 0 && x === f.suggestedOrder ? `Suggested ${units(x)}` : units(x)}
                  </Button>
                ))}
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-muted-foreground">Days of stock</div>
              <div className="tnum text-3xl font-semibold tracking-tight">{result === null ? "—" : dec1(result)}</div>
              <div className="text-xs text-muted-foreground">
                {result === null ? "" : `until about ${formatDay(addDays(report.today, Math.floor(result)))}`}
              </div>
            </div>
          </div>
          <CoverageBar f={f} tryUnits={valid ? n : 0} />
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              ({units(f.stock)} in warehouse + {units(f.onOrder)} on order + {valid ? units(n) : "?"}) ÷ {dec1(f.adjustedBurn)} per day
            </span>
            <Button size="sm" disabled={!valid || n <= 0} onClick={() => dialogs.newOrder({ productId: row.product.id, units: n })}>
              Order {valid && n > 0 ? units(n) : ""} units
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function ProductOrders({ row }: { row: ProductRow }) {
  const { report } = useApp();
  const orders = report.orders.filter((o) => o.order.productId === row.product.id).slice(0, 6);
  if (!orders.length) return <p className="p-4 text-sm text-muted-foreground">No supplier orders yet.</p>;
  return (
    <ul className="divide-y">
      {orders.map((o) => (
        <li key={o.order.id}>
          <a href={`#order-${o.order.id}`} className="block px-4 py-3 hover:bg-accent/40">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-medium">{o.order.name}</span>
              <OrderBadge status={o.status} />
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>
                {units(o.order.units)} units · ordered {formatDay(o.order.orderedOn)}
              </span>
              {o.alerts.some((a) => a.due) && <span className="text-st-reorder">Needs chasing</span>}
            </div>
            <StageBar p={o.progress} gone={o.status === "closed" ? o.progress.remaining : 0} className="mt-2" />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Every number, worked through with this product's actual values. */
function Workings({ row, className }: { row: ProductRow; className?: string }) {
  const f = row.forecast;
  const s = f.settings;
  const lines: [string, ReactNode, string][] = [
    ["Sold 7 days", `${units(f.prior4Units)} + ${units(f.last3Units)}`, units(f.sold7)],
    ["Daily burn", `${units(f.sold7)} ÷ 7`, dec1(f.dailyBurn)],
    [
      "Trend factor",
      f.rawTrend === null ? "prior 4 days had no sales" : `(${units(f.last3Units)} ÷ 3) ÷ (${units(f.prior4Units)} ÷ 4) = ${f.rawTrend.toFixed(2)}`,
      factor(f.trendFactor) + (f.rawTrend !== null && f.rawTrend !== f.trendFactor ? " (capped)" : ""),
    ],
    ["Adjusted burn", `${f.dailyBurn.toFixed(2)} × ${f.trendFactor.toFixed(2)}, 1 decimal`, dec1(f.adjustedBurn)],
    ["Days of stock", `${units(f.stock)} ÷ ${dec1(f.adjustedBurn)}`, fmtDays(f.daysOfStock, "")],
    ["With everything ordered", `(${units(f.stock)} + ${units(f.onOrder)}) ÷ ${dec1(f.adjustedBurn)}`, fmtDays(f.daysWithOrdered, "")],
    ["Reorder by", `today + (${fmtDays(f.daysOfStock, "")} − ${s.leadTimeDays} − ${s.safetyDays})`, f.reorderBy ? formatDay(f.reorderBy) : "—"],
    [
      "Suggested order",
      `(${s.targetDays} + ${s.leadTimeDays}) × ${dec1(f.adjustedBurn)} − ${units(f.stock)}`,
      units(f.suggestedOrder),
    ],
  ];
  return (
    <Panel
      title="How the numbers are worked out"
      description={`Lead time ${s.leadTimeDays} d, safety ${s.safetyDays} d, target ${s.targetDays} d${Object.keys(row.product.forecast).length ? " (this product has its own settings)" : ""}.`}
      className={className}
      bodyClassName="p-0"
    >
      <dl className="divide-y text-sm">
        {lines.map(([k, how, v]) => (
          <div key={k} className="grid grid-cols-[1fr_auto] gap-x-3 px-4 py-2">
            <dt className="font-medium">{k}</dt>
            <dd className="tnum text-right font-semibold">{v}</dd>
            <dd className="tnum col-span-2 text-xs text-muted-foreground">{how}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function RecentHistory({ row }: { row: ProductRow }) {
  const { data } = useApp();
  const ledger = stockLedger(data, row.product).slice(-8).reverse();
  return (
    <Panel
      title="Recent stock changes"
      action={
        <Button variant="ghost" size="sm" asChild>
          <a href={`#history-${row.product.id}`}>Full history</a>
        </Button>
      }
      bodyClassName="p-0"
    >
      <ul className="divide-y">
        {ledger.map((l) => (
          <li key={l.key} className="grid grid-cols-[1fr_auto] gap-x-4 px-4 py-2.5 text-sm">
            <div className="min-w-0">
              <span className="font-medium">{LEDGER_LABEL[l.kind]}</span>{" "}
              <span className="text-muted-foreground">· {formatDay(l.date)}</span>
              <div className="truncate text-xs text-muted-foreground">{l.why}</div>
            </div>
            <div className="text-right">
              <div className={cn("tnum font-medium", l.change > 0 ? "text-st-ok" : l.change < 0 ? "" : "text-muted-foreground")}>
                {l.change > 0 ? "+" : ""}
                {l.change === 0 ? "±0" : units(l.change)}
              </div>
              <div className="tnum text-xs text-muted-foreground">= {units(l.balance)}</div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
