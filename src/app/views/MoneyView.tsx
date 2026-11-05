import { useMemo, type ReactNode } from "react";
import { ArrowRightIcon, CircleDollarSignIcon, PackagePlusIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDay } from "@/domain/dates";
import { buildMoney, type MoneyLine } from "@/domain/money";
import { useApp } from "../context";
import { useDialogs } from "../dialogs/DialogProvider";
import { StockBadge } from "../components/badges";
import { EmptyState, PageHeader, Panel, go } from "../components/bits";
import { money, moneyShort, plural, price, units } from "../format";

/** Where the money is: stock in the warehouse, cash promised to suppliers, and what reorders will cost. */
export function MoneyView() {
  const { report } = useApp();
  const dialogs = useDialogs();
  const m = useMemo(() => buildMoney(report), [report]);
  const priced = m.lines.filter((l) => l.unitCost !== null);

  if (!priced.length) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Money" />
        <EmptyState title="No unit costs yet" icon={<CircleDollarSignIcon className="size-5" />}>
          Add what you pay per unit to each product in Setup → Products, and this page shows what your stock is worth and what's promised to suppliers.
          <div className="mt-3">
            <Button size="sm" onClick={() => go("setup")}>
              Open Setup
            </Button>
          </div>
        </EmptyState>
      </div>
    );
  }

  const lateTotal = m.suppliers.reduce((s, x) => s + x.late, 0);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Money"
        description="Every amount is units × unit cost."
        actions={
          m.reorderDue.products > 0 && (
            <Button onClick={() => dialogs.reorderPlan()}>
              <PackagePlusIcon /> Plan reorders
            </Button>
          )
        }
      />

      {m.missingCost.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-st-urgent/40 bg-st-urgent-bg px-4 py-3 text-sm">
          <TriangleAlertIcon className="size-4 shrink-0 text-st-urgent" />
          <p className="min-w-0 flex-1">
            <span className="font-medium">No unit cost for {m.missingCost.map((p) => p.name).join(", ")}.</span>{" "}
            <span className="text-foreground/75">Their units are left out of every total below.</span>
          </p>
          <Button size="sm" variant="outline" onClick={() => go("setup")}>
            Add costs
          </Button>
        </div>
      )}

      <Summary m={m} lateTotal={lateTotal} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="When promised cash turns into stock" description="Open orders by the week they should land. Late units count as due now.">
          <Landing weeks={m.landing} late={lateTotal} />
        </Panel>
        <Panel title="By supplier" description="Open orders only." bodyClassName="p-0">
          {m.suppliers.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nothing on order.</p>
          ) : (
            <ul className="divide-y">
              {m.suppliers.map((s) => (
                <li key={s.supplier.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{s.supplier.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {plural(s.openOrders, "open order")}
                      {s.late > 0 && <span className="text-st-out"> · {money(s.late)} late ({units(s.lateUnits)} units)</span>}
                    </div>
                  </div>
                  <span className="tnum text-sm font-semibold">{money(s.committed)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t px-4 py-2.5">
            <a href="#suppliers" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              Supplier scorecard <ArrowRightIcon className="size-3" />
            </a>
          </div>
        </Panel>
      </div>

      <section aria-labelledby="money-products" className="min-w-0 rounded-xl border surface">
        <div className="border-b px-4 py-3">
          <h2 id="money-products" className="text-sm font-semibold">
            By product <span className="font-normal text-muted-foreground">· most money first</span>
          </h2>
        </div>
        <ProductMoneyTable lines={m.lines} />
        <ProductMoneyCards lines={m.lines} />
      </section>
    </div>
  );
}

function Summary({ m, lateTotal }: { m: ReturnType<typeof buildMoney>; lateTotal: number }) {
  const parts = [
    { key: "stock", label: "In the warehouse", value: m.stockValue, cls: "bg-sg-arrived" },
    { key: "transit", label: "On the way", value: m.onOrder.onTheWay, cls: "bg-sg-transit" },
    { key: "production", label: "In production", value: m.onOrder.inProduction, cls: "bg-sg-production" },
    { key: "placed", label: "Placed, not confirmed", value: m.onOrder.placed, cls: "bg-sg-placed" },
  ];
  const total = Math.max(1, parts.reduce((s, p) => s + p.value, 0));
  const strong = (x: ReactNode) => <span className="tnum font-semibold text-foreground">{x}</span>;
  return (
    <section aria-label="Summary" className="rounded-xl border surface p-4 sm:p-5">
      <p className="max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        {strong(money(m.stockValue))} of stock sits in the warehouse. {strong(money(m.onOrder.total))} is promised to suppliers and hasn't arrived
        {lateTotal > 0 && (
          <>
            , and <span className="tnum font-semibold text-st-out">{money(lateTotal)}</span> of that is late
          </>
        )}
        .{" "}
        {m.reorderDue.products > 0 ? (
          <>
            Reorders due now need {strong(money(m.reorderDue.value))} more.
          </>
        ) : (
          "Nothing needs reordering right now."
        )}
      </p>
      <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Money by stage">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.key} className={cn("h-full first:rounded-l-full last:rounded-r-full", p.cls)} style={{ width: `${(p.value / total) * 100}%` }} />
          ))}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {parts.map((p) => (
          <div key={p.key} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("size-2 shrink-0 rounded-sm", p.cls)} />
              {p.label}
            </dt>
            <dd className="tnum mt-0.5 text-sm font-semibold">{money(p.value)}</dd>
          </div>
        ))}
      </dl>
      {m.excess.value > 0 && (
        <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{money(m.excess.value)}</span> of the warehouse stock is more than lead time + target days of sales (
          {plural(m.excess.units, "unit")} across {plural(m.excess.products, "product")}). That's cash a smaller next order could free up.
        </p>
      )}
    </section>
  );
}

function Landing({ weeks, late }: { weeks: { weekOf: string; value: number }[]; late: number }) {
  const max = Math.max(1, ...weeks.map((w) => w.value));
  return (
    <div>
      <ol className="flex h-44 items-end gap-1.5 sm:gap-2" aria-label="Committed cash by week">
        {weeks.map((w, i) => {
          const latePart = i === 0 ? Math.min(late, w.value) : 0;
          const h = (w.value / max) * 100;
          return (
            <li key={w.weekOf} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className={cn("tnum text-[11px] whitespace-nowrap", w.value ? "font-medium" : "text-muted-foreground")}>{w.value ? moneyShort(w.value) : "–"}</span>
              <div className="flex w-full max-w-10 flex-col overflow-hidden rounded-md" style={{ height: `${Math.max(w.value ? 4 : 0, h * 0.78)}%` }}>
                {latePart > 0 && <div className="w-full bg-st-out" style={{ height: `${(latePart / w.value) * 100}%` }} title={`${money(latePart)} late`} />}
                <div className="w-full flex-1 bg-sg-transit" />
              </div>
            </li>
          );
        })}
      </ol>
      <ol className="mt-2 flex gap-1.5 sm:gap-2" aria-hidden>
        {weeks.map((w, i) => (
          <li key={w.weekOf} className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground">
            {i === 0 ? "This wk" : formatDay(w.weekOf)}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-sg-transit" /> Expected to land
        </span>
        {late > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-st-out" /> Late, still not here
          </span>
        )}
      </div>
    </div>
  );
}

function Cost({ l }: { l: MoneyLine }) {
  return l.unitCost === null ? <span className="text-st-urgent">No cost</span> : <span className="tnum">{price(l.unitCost)}</span>;
}

function Value({ value, sub, tone }: { value: number; sub?: string; tone?: string }) {
  if (!value) return <span className="text-muted-foreground">–</span>;
  return (
    <div>
      <div className={cn("tnum font-medium", tone)}>{money(value)}</div>
      {sub && <div className="tnum text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function ProductMoneyTable({ lines }: { lines: MoneyLine[] }) {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-medium">
            <th className="pl-4">Product</th>
            <th>Status</th>
            <th className="text-right">Unit cost</th>
            <th className="text-right">In the warehouse</th>
            <th className="text-right">Promised to supplier</th>
            <th className="text-right" title="Stock beyond lead time + target days of sales">Over-stock</th>
            <th className="pr-4 text-right" title="SOP suggested order × unit cost, for products past the reorder line">Reorder due</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr
              key={l.row.product.id}
              onClick={() => go(`product-${l.row.product.id}`)}
              className="cursor-pointer border-b last:border-0 hover:bg-accent/40 [&>td]:px-3 [&>td]:py-3 [&>td]:align-top"
            >
              <td className="pl-4">
                <a href={`#product-${l.row.product.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                  {l.row.product.name}
                </a>
                <div className="font-mono text-xs text-muted-foreground">{l.row.product.code}</div>
              </td>
              <td>
                <StockBadge status={l.row.forecast.status} />
              </td>
              <td className="text-right">
                <Cost l={l} />
              </td>
              <td className="text-right">
                <Value value={l.stockValue} sub={`${units(Math.max(0, l.row.stock))} units`} />
              </td>
              <td className="text-right">
                <Value value={l.onOrderValue} sub={plural(l.row.openOrders.length, "order")} />
              </td>
              <td className="text-right">
                <Value value={l.excessValue} sub={l.excessUnits ? `${units(l.excessUnits)} extra` : undefined} />
              </td>
              <td className="pr-4 text-right">
                <Value value={l.reorderValue} sub={l.reorderUnits ? `${units(l.reorderUnits)} units` : undefined} tone="text-st-reorder" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductMoneyCards({ lines }: { lines: MoneyLine[] }) {
  return (
    <ul className="grid gap-3 p-3 sm:grid-cols-2 lg:hidden">
      {lines.map((l) => (
        <li key={l.row.product.id}>
          <a href={`#product-${l.row.product.id}`} className="block h-full rounded-lg border px-3.5 py-3 transition-colors hover:bg-accent/40 active:bg-accent/60">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{l.row.product.name}</div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono">{l.row.product.code}</span> · <Cost l={l} /> each
                </div>
              </div>
              <StockBadge status={l.row.forecast.status} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Warehouse</dt>
                <dd className="tnum mt-0.5 text-sm font-semibold">{l.stockValue ? moneyShort(l.stockValue) : "–"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Promised</dt>
                <dd className="tnum mt-0.5 text-sm font-semibold">{l.onOrderValue ? moneyShort(l.onOrderValue) : "–"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Reorder due</dt>
                <dd className={cn("tnum mt-0.5 text-sm font-semibold", l.reorderValue && "text-st-reorder")}>{l.reorderValue ? moneyShort(l.reorderValue) : "–"}</dd>
              </div>
            </dl>
            {l.excessValue > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {money(l.excessValue)} over-stocked ({units(l.excessUnits)} extra)
              </p>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
