import { useMemo, useState } from "react";
import { MoreHorizontalIcon, PackagePlusIcon, PencilIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteArrival } from "@/domain/mutations";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { unmatchedUnits } from "@/domain/arrivals";
import { byTime, formatDay } from "@/domain/dates";
import type { Arrival, SupplierOrder } from "@/domain/types";
import { useApp } from "../context";
import { useDialogs } from "../dialogs/DialogProvider";
import { Confirm, EmptyState, PageHeader, Who } from "../components/bits";
import { units } from "../format";

/** Rows shown at first, and added per "Show more": keeps the page quick after years of deliveries. */
const PAGE = 40;

export function ArrivalsView() {
  const { data, report } = useApp();
  const dialogs = useDialogs();
  const [limit, setLimit] = useState(PAGE);
  const arrivals = useMemo(() => [...data.arrivals].sort((a, b) => byTime(b.receivedOn, a.receivedOn) || byTime(b.name, a.name)), [data.arrivals]);
  const orders = useMemo(() => new Map(data.orders.map((o) => [o.id, o])), [data.orders]);
  const shown = arrivals.slice(0, limit);
  const older = arrivals.length - shown.length;

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
            <TriangleAlertIcon className="size-4" /> {report.unmatchedArrivals.length} {report.unmatchedArrivals.length === 1 ? "arrival needs" : "arrivals need"} matching
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
        <section className="min-w-0 rounded-xl border surface">
          <ul className="divide-y">
            {shown.map((a) => (
              <ArrivalRow key={a.id} a={a} orders={orders} />
            ))}
          </ul>
          {older > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
              <span>
                Showing the latest {units(shown.length)} of {units(arrivals.length)}
              </span>
              <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                Show {units(Math.min(PAGE, older))} older
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function productName(data: ReturnType<typeof useApp>["data"], a: Arrival) {
  return data.products.find((p) => p.id === a.productId)?.name ?? "Deleted product";
}

function ArrivalRow({ a, orders: names }: { a: Arrival; orders: Map<string, SupplierOrder> }) {
  const { data, run } = useApp();
  const dialogs = useDialogs();
  const [askDelete, setAskDelete] = useState(false);
  const fed = a.allocations.filter((al) => al.orderId && al.units > 0);
  const left = unmatchedUnits(a);
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
          {last?.action === "Changed match" ? "Match changed by " : last?.action === "Edited arrival" ? "Edited by " : "Recorded by "}
          <Who actor={last?.actor ?? null} />
        </div>
      </div>
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" onClick={() => dialogs.match(a.id)}>
          Change match
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${a.name}`}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => dialogs.editArrival(a.id)}>
              <PencilIcon /> Edit units, date, note
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setAskDelete(true)}>
              <Trash2Icon /> Delete arrival
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Confirm
        open={askDelete}
        onOpenChange={setAskDelete}
        title={`Delete ${a.name}?`}
        body={
          <>
            Use this for an arrival entered by mistake. Warehouse stock drops by {units(a.units)}
            {fed.length
              ? `, and ${fed.map((al) => `${names.get(al.orderId!)?.name ?? "an order"} (${units(al.units)})`).join(", ")} go back to waiting for those units`
              : ""}
            . You can undo it right after.
          </>
        }
        confirm="Delete arrival"
        destructive
        onConfirm={() => void run((s, actor, now) => deleteArrival(s, a.id, actor, now), `${a.name} deleted`)}
      />
    </li>
  );
}
