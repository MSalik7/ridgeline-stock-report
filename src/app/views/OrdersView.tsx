import { useEffect, useState } from "react";
import { BellRingIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDay } from "@/domain/dates";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/domain/orders";
import type { OrderView } from "@/domain/report";
import { useApp } from "../context";
import { useDialogs } from "../dialogs/DialogProvider";
import { OrderBadge } from "../components/badges";
import { StageBar } from "../components/charts";
import { EmptyState, PageHeader, go } from "../components/bits";
import { units } from "../format";
import { OrderSheet } from "./OrderSheet";
import { OrdersTabs } from "./ScorecardView";

export type StageFilter = "open" | "chase" | OrderStatus | "all";

const STAGES: { value: StageFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "chase", label: "Needs chasing" },
  { value: "placed", label: ORDER_STATUS_LABEL.placed },
  { value: "in_production", label: ORDER_STATUS_LABEL.in_production },
  { value: "on_the_way", label: ORDER_STATUS_LABEL.on_the_way },
  { value: "partial", label: ORDER_STATUS_LABEL.partial },
  { value: "received", label: ORDER_STATUS_LABEL.received },
  { value: "closed", label: ORDER_STATUS_LABEL.closed },
  { value: "cancelled", label: ORDER_STATUS_LABEL.cancelled },
  { value: "all", label: "All" },
];

const FILTER_KEY = "ridgeline-stock:orders-filter";

function readFilter(): { product: string; stage: StageFilter } {
  try {
    const raw = sessionStorage.getItem(FILTER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { product: "all", stage: "open" };
}

export function OrdersView({ route }: { route: string }) {
  const { report, data } = useApp();
  const dialogs = useDialogs();
  const openId = route.startsWith("order-") ? route.slice(6) : null;
  const [filter, setFilterState] = useState(readFilter);
  useEffect(() => {
    if (route === "orders-chase") setFilterState((f) => ({ ...f, stage: "chase" }));
  }, [route]);
  const { product, stage } = filter;

  const setFilter = (next: { product?: string; stage?: StageFilter }) => {
    const v = { ...filter, ...next };
    setFilterState(v);
    try {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  };

  const match = (o: OrderView) => {
    if (product !== "all" && o.order.productId !== product) return false;
    if (stage === "all") return true;
    if (stage === "open") return o.open;
    if (stage === "chase") return o.alerts.length > 0;
    return o.status === stage;
  };
  const rows = report.orders.filter(match);
  const count = (s: StageFilter) =>
    report.orders.filter((o) => (product === "all" || o.order.productId === product) && (s === "all" ? true : s === "open" ? o.open : s === "chase" ? o.alerts.some((a) => a.due) : o.status === s)).length;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Supplier orders"
        description="Every order from placed to arrived. Open orders count toward stock numbers."
        actions={
          <Button onClick={() => dialogs.newOrder()}>
            <PlusIcon /> New order
          </Button>
        }
      />

      <OrdersTabs active="orders" />

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={product} onValueChange={(v) => setFilter({ product: v })}>
            <SelectTrigger className="w-full sm:w-64" aria-label="Filter by product">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              {data.products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="font-mono text-xs text-muted-foreground">{p.code}</span> {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Filter by stage">
          {STAGES.map((s) => {
            const n = count(s.value);
            const on = stage === s.value;
            return (
              <button
                key={s.value}
                role="tab"
                aria-selected={on}
                onClick={() => setFilter({ stage: s.value })}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  on ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {s.value === "chase" && <BellRingIcon className="size-3" />}
                {s.label}
                <span className={cn("tnum", on ? "text-background/70" : "text-muted-foreground/70")}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No orders match">Try another stage or product, or place a new order.</EmptyState>
      ) : (
        <section className="min-w-0 rounded-xl border surface">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-medium">
                  <th className="pl-4">Order</th>
                  <th>Supplier</th>
                  <th className="text-right">Units</th>
                  <th className="w-[26%]">Where the units are</th>
                  <th>Status</th>
                  <th className="pr-4">Ordered · due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.order.id}
                    onClick={() => go(`order-${o.order.id}`)}
                    className={cn("cursor-pointer border-b last:border-0 hover:bg-accent/40 [&>td]:px-3 [&>td]:py-3 [&>td]:align-top", openId === o.order.id && "bg-accent/60")}
                  >
                    <td className="pl-4">
                      <a href={`#order-${o.order.id}`} className="font-mono font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {o.order.name}
                      </a>
                      <div className="text-xs text-muted-foreground">{o.product?.name}</div>
                    </td>
                    <td className="text-muted-foreground">{o.supplier?.name}</td>
                    <td className="tnum text-right font-medium">{units(o.order.units)}</td>
                    <td>
                      <StageBar p={o.progress} gone={o.status === "closed" ? o.progress.remaining : 0} className="mt-1.5" />
                      <div className="tnum mt-1.5 text-xs text-muted-foreground">{summary(o)}</div>
                    </td>
                    <td>
                      <OrderBadge status={o.status} />
                      {o.alerts.map((a) => (
                        <div key={a.kind} className={cn("mt-1 text-[11px]", a.due ? "text-st-reorder" : "text-muted-foreground")}>
                          {a.due ? a.reason : `Chased, due again ${a.nextDueOn ? formatDay(a.nextDueOn) : ""}`}
                        </div>
                      ))}
                    </td>
                    <td className="tnum pr-4 text-muted-foreground">
                      {formatDay(o.order.orderedOn)} <span className="text-xs">· {age(o, report.today)}</span>
                      <Due o={o} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y md:hidden">
            {rows.map((o) => (
              <li key={o.order.id}>
                <a href={`#order-${o.order.id}`} className="block px-4 py-3.5 active:bg-accent/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono font-medium">{o.order.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {o.product?.name} · {o.supplier?.name}
                      </div>
                    </div>
                    <OrderBadge status={o.status} />
                  </div>
                  <StageBar p={o.progress} gone={o.status === "closed" ? o.progress.remaining : 0} className="mt-3" />
                  <div className="tnum mt-1.5 flex justify-between gap-2 text-xs text-muted-foreground">
                    <span>{summary(o)}</span>
                    <Due o={o} />
                  </div>
                  {o.alerts.filter((a) => a.due).map((a) => (
                    <div key={a.kind} className="mt-1 text-xs text-st-reorder">
                      {a.reason}
                    </div>
                  ))}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <OrderSheet orderId={openId} onClose={() => go("orders")} />
    </div>
  );
}

/** When the rest of the order should land: the earliest part still to come. */
export function Due({ o }: { o: OrderView }) {
  if (o.status === "received") return <div className="text-xs text-st-ok">All arrived</div>;
  if (!o.open || !o.incoming.length) return <div className="text-xs">—</div>;
  const late = o.incoming.find((i) => i.late);
  if (late) return <div className="text-xs font-medium text-st-out">{late.daysLate} d late</div>;
  return <div className="text-xs">due {formatDay(o.incoming[0].expectedOn)}</div>;
}

function summary(o: OrderView) {
  const p = o.progress;
  if (o.status === "cancelled") return `${units(p.ordered)} cancelled`;
  const parts: string[] = [];
  if (p.arrived) parts.push(`${units(p.arrived)} arrived`);
  if (p.onTheWay) parts.push(`${units(p.onTheWay)} on the way`);
  if (p.inProduction) parts.push(`${units(p.inProduction)} in production`);
  if (p.placed) parts.push(`${units(p.placed)} placed`);
  if (o.status === "closed" && p.remaining) parts.push(`${units(p.remaining)} not coming`);
  return parts.join(" · ");
}

function age(o: OrderView, today: string) {
  const d = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${o.order.orderedOn}T12:00:00Z`)) / 86_400_000);
  return d === 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
}
