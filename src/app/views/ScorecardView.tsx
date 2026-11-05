import { useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { effectiveSettings } from "@/domain/forecast";
import { saveProduct } from "@/domain/mutations";
import { supplierScores, type SupplierScore } from "@/domain/suppliers";
import { useApp } from "../context";
import { EmptyState, PageHeader } from "../components/bits";
import { dec1, units } from "../format";

/** Switch between the order list and the scorecard. */
export function OrdersTabs({ active }: { active: "orders" | "suppliers" }) {
  const tabs = [
    { id: "orders", label: "Orders", href: "#orders" },
    { id: "suppliers", label: "Supplier scorecard", href: "#suppliers" },
  ] as const;
  return (
    <nav aria-label="Supplier orders views" className="inline-flex w-fit rounded-lg bg-muted p-1">
      {tabs.map((t) => (
        <a
          key={t.id}
          href={t.href}
          aria-current={active === t.id ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
            active === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}

const VERDICT = {
  ok: "bg-st-ok-bg text-st-ok",
  watch: "bg-st-watch-bg text-st-watch",
  bad: "bg-st-out-bg text-st-out",
} as const;

export function ScorecardView() {
  const { data, report, run } = useApp();
  const scores = useMemo(() => supplierScores(data, report), [data, report]);
  const hints = scores.flatMap((s) => s.hints.map((h) => ({ ...h, supplier: s.supplier })));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Supplier scorecard"
        description="How each supplier actually performs, measured from the orders on record."
      />
      <OrdersTabs active="suppliers" />

      {scores.length === 0 ? (
        <EmptyState title="No suppliers yet">Add one under Setup → Suppliers.</EmptyState>
      ) : (
        <section className="min-w-0 rounded-xl border surface">
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-medium">
                  <th className="pl-4">Supplier</th>
                  <th>Verdict</th>
                  <th className="text-right">Orders</th>
                  <th className="text-right" title="Average days from ordering to confirmation (marked, tracking or first arrival)">Confirms in</th>
                  <th className="text-right" title="Average days from ordering to the first units arriving">Real lead time</th>
                  <th className="text-right" title="Delivered orders whose first units arrived within the product's lead-time setting">On time</th>
                  <th className="text-right" title="Units never delivered on orders closed early">Short-shipped</th>
                  <th className="pr-4 text-right">Late now</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.supplier.id} className="border-b last:border-0 [&>td]:px-3 [&>td]:py-3 [&>td]:align-top">
                    <td className="pl-4">
                      <div className="font-medium">{s.supplier.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.supplier.contact} · <span className="select-all">{s.supplier.email}</span>
                      </div>
                    </td>
                    <td>
                      <Verdict s={s} />
                    </td>
                    <td className="tnum text-right">
                      {s.orders}
                      <div className="text-xs text-muted-foreground">{s.open} open</div>
                    </td>
                    <td className="tnum text-right">{s.confirmDays === null ? "—" : `${dec1(s.confirmDays)} d`}</td>
                    <td className="tnum text-right">
                      {s.leadDays === null ? "—" : `${Math.round(s.leadDays)} d`}
                      <Setting s={s} />
                    </td>
                    <td className="tnum text-right">
                      <Rate value={s.onTimeRate} good={0.8} />
                      {s.delivered > 0 && <div className="text-xs text-muted-foreground">of {s.delivered} delivered</div>}
                    </td>
                    <td className="tnum text-right">
                      {s.shortRate === null ? "—" : `${Math.round(s.shortRate * 100)}%`}
                      {s.shortUnits > 0 && <div className="text-xs text-muted-foreground">{units(s.shortUnits)} units</div>}
                    </td>
                    <td className={cn("tnum pr-4 text-right", s.lateNow > 0 && "font-medium text-st-out")}>{s.lateNow ? `${s.lateNow} order${s.lateNow === 1 ? "" : "s"}` : "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid gap-3 p-3 sm:grid-cols-2 lg:hidden">
            {scores.map((s) => (
              <li key={s.supplier.id} className="rounded-lg border px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{s.supplier.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.orders} orders · {s.open} open
                    </div>
                  </div>
                  <Verdict s={s} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <Item label="Confirms in" value={s.confirmDays === null ? "—" : `${dec1(s.confirmDays)} d`} />
                  <Item label="Real lead time" value={<>{s.leadDays === null ? "—" : `${Math.round(s.leadDays)} d`} <Setting s={s} inline /></>} />
                  <Item label="On time" value={<Rate value={s.onTimeRate} good={0.8} />} />
                  <Item label="Short-shipped" value={s.shortRate === null ? "—" : `${Math.round(s.shortRate * 100)}% (${units(s.shortUnits)})`} />
                </dl>
                {s.lateNow > 0 && <div className="mt-2 text-xs font-medium text-st-out">{s.lateNow} late order right now</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border surface">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Lead times that don't match reality</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Forecasts plan with each product's lead-time setting. When a supplier is really slower or faster, reorder dates come out wrong.
          </p>
        </div>
        {hints.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Every setting is within 3 days of what suppliers actually take.</p>
        ) : (
          <ul className="divide-y">
            {hints.map((h) => {
              const s = effectiveSettings(data.settings.forecast, h.product);
              const slower = h.actual > h.setting;
              return (
                <li key={h.product.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 text-sm">
                    <a href={`#product-${h.product.id}`} className="font-medium hover:underline">
                      {h.product.name}
                    </a>{" "}
                    <span className="text-muted-foreground">from {h.supplier.name}</span>
                    <p className="text-muted-foreground">
                      Set to {h.setting} days, but {h.orders === 1 ? "the last delivery" : `the last ${h.orders} deliveries`} took{" "}
                      <span className={cn("font-medium", slower ? "text-st-reorder" : "text-foreground")}>{h.actual} days</span>
                      {slower
                        ? `. Reorder dates are ${h.actual - h.setting} days too late; the reorder line would move to ${h.actual + s.safetyDays} days.`
                        : `. Reorders are being placed ${h.setting - h.actual} days earlier than needed.`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={slower ? "default" : "outline"}
                    className="self-start sm:self-center"
                    onClick={() =>
                      run(
                        (st) => saveProduct(st, { ...h.product, forecast: { ...h.product.forecast, leadTimeDays: h.actual } }),
                        `${h.product.name} lead time set to ${h.actual} days`,
                      )
                    }
                  >
                    Use {h.actual} days
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Verdict({ s }: { s: SupplierScore }) {
  return <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap", VERDICT[s.verdict.tone])}>{s.verdict.label}</span>;
}

function Setting({ s, inline = false }: { s: SupplierScore; inline?: boolean }) {
  const { data } = useApp();
  const settings = [...new Set(data.products.filter((p) => p.supplierId === s.supplier.id).map((p) => effectiveSettings(data.settings.forecast, p).leadTimeDays))];
  if (settings.length !== 1 || s.leadDays === null) return null;
  const diff = Math.round(s.leadDays) - settings[0];
  return (
    <span className={cn(inline ? "ml-1" : "block", "text-xs", diff >= 3 ? "text-st-reorder" : "text-muted-foreground")}>
      vs {settings[0]} d set
    </span>
  );
}

function Rate({ value, good }: { value: number | null; good: number }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return <span className={cn(value < 0.5 ? "text-st-out" : value < good ? "text-st-watch" : "")}>{Math.round(value * 100)}%</span>;
}

function Item({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tnum mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}
