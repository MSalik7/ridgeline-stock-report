import { PackagePlusIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { unmatchedUnits } from "@/domain/arrivals";
import { formatDay } from "@/domain/dates";
import type { Arrival } from "@/domain/types";
import { useApp } from "../context";
import { useDialogs } from "../dialogs/DialogProvider";
import { EmptyState, PageHeader, Who } from "../components/bits";
import { units } from "../format";

export function ArrivalsView() {
  const { data, report } = useApp();
  const dialogs = useDialogs();
  const arrivals = [...data.arrivals].sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.name.localeCompare(a.name));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Warehouse arrivals"
        description="What arrived and which supplier order it belonged to. New arrivals fill the oldest open order first, then spill into the next."
        actions={
          <Button onClick={() => dialogs.arrival()}>
            <PackagePlusIcon /> Record arrival
          </Button>
        }
      />

      {report.unmatchedArrivals.length > 0 && (
        <section className="rounded-xl border border-st-urgent/40 bg-st-urgent-bg">
          <div className="flex items-center gap-2 border-b border-st-urgent/20 px-4 py-3 text-sm font-semibold text-st-urgent">
            <TriangleAlertIcon className="size-4" /> {report.unmatchedArrivals.length} arrival{report.unmatchedArrivals.length === 1 ? "" : "s"} need matching
          </div>
          <ul className="divide-y divide-st-urgent/20">
            {report.unmatchedArrivals.map(({ arrival, units: n }) => (
              <li key={arrival.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-mono font-medium">{arrival.name}</span> · {productName(data, arrival)} ·{" "}
                  <span className="font-medium">{units(n)} unmatched</span>
                  <div className="text-xs text-foreground/70">
                    Received {formatDay(arrival.receivedOn)}
                    {arrival.note && ` · ${arrival.note}`}. Match to an order, or mark as not from an order.
                  </div>
                </div>
                <Button size="sm" onClick={() => dialogs.match(arrival.id)}>
                  Match units
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {arrivals.length === 0 ? (
        <EmptyState title="No arrivals yet">Record the first one when a delivery lands at the warehouse.</EmptyState>
      ) : (
        <section className="min-w-0 rounded-xl border bg-card">
          <ul className="divide-y">
            {arrivals.map((a) => (
              <ArrivalRow key={a.id} a={a} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function productName(data: ReturnType<typeof useApp>["data"], a: Arrival) {
  return data.products.find((p) => p.id === a.productId)?.name ?? "Deleted product";
}

function ArrivalRow({ a }: { a: Arrival }) {
  const { data } = useApp();
  const dialogs = useDialogs();
  const left = unmatchedUnits(a);
  const names = new Map(data.orders.map((o) => [o.id, o]));
  const last = a.history[a.history.length - 1];
  return (
    <li className="grid gap-3 px-4 py-3.5 md:grid-cols-[12rem_1fr_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-medium">{a.name}</span>
          <span className="tnum text-sm font-semibold">+{units(a.units)}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {productName(data, a)} · {formatDay(a.receivedOn)}
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap gap-1.5">
          {a.allocations.map((al) => {
            const o = al.orderId ? names.get(al.orderId) : null;
            return (
              <span
                key={al.orderId ?? "none"}
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs",
                  al.orderId ? "bg-card" : "border-dashed text-muted-foreground",
                )}
              >
                {al.orderId ? (
                  <a href={`#order-${al.orderId}`} className="font-mono font-medium hover:underline">
                    {o?.name ?? "deleted order"}
                  </a>
                ) : (
                  "Not from an order"
                )}
                <span className="tnum text-muted-foreground">{units(al.units)}</span>
              </span>
            );
          })}
          {left > 0 && (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-st-urgent-bg px-2 text-xs font-medium text-st-urgent">
              Unmatched <span className="tnum">{units(left)}</span>
            </span>
          )}
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {a.note && `${a.note} · `}
          {last?.action === "Changed match" ? "Match changed by " : "Recorded by "}
          <Who actor={last?.actor ?? null} />
        </div>
      </div>
      <div>
        <Button variant="outline" size="sm" onClick={() => dialogs.match(a.id)}>
          Change match
        </Button>
      </div>
    </li>
  );
}
