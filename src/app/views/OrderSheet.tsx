import { useState } from "react";
import {
  BanIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  MailIcon,
  MoreHorizontalIcon,
  PackageCheckIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
  TruckIcon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatDay, formatMoment } from "@/domain/dates";
import { confirmOrder, deleteOrder, removeTracking, setOrderState } from "@/domain/mutations";
import { CHASE_LABEL, shipmentStates, trackingUrl } from "@/domain/orders";
import type { OrderView } from "@/domain/report";
import type { HistoryEntry } from "@/domain/types";
import { useApp } from "../context";
import { useDialogs } from "../dialogs/DialogProvider";
import { OrderBadge } from "../components/badges";
import { StageBar } from "../components/charts";
import { Confirm, Who } from "../components/bits";
import { units } from "../format";

export function OrderSheet({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { report } = useApp();
  const view = orderId ? report.orderById.get(orderId) : undefined;
  return (
    <Sheet open={!!view} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {view && <OrderDetail view={view} onDeleted={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

export function OrderDetail({ view, onDeleted, supplierMode = false }: { view: OrderView; onDeleted?: () => void; supplierMode?: boolean }) {
  const { data, run } = useApp();
  const dialogs = useDialogs();
  const [ask, setAsk] = useState<null | "cancel" | "close" | "delete">(null);
  const { order, progress: p, status } = view;
  const open = order.state === "open";
  const canTrack = open && order.units - p.tracked > 0;
  const shipments = shipmentStates(order, p.arrived);

  // Arrivals matched to this order, for the history and the arrivals list.
  const arrivals = data.arrivals
    .flatMap((a) => a.allocations.filter((al) => al.orderId === order.id).map((al) => ({ a, units: al.units })))
    .sort((x, y) => x.a.receivedOn.localeCompare(y.a.receivedOn));
  const history: (HistoryEntry & { key: string })[] = [
    ...order.history.map((h, i) => ({ ...h, key: `o${i}` })),
    ...data.arrivals.flatMap((a) =>
      a.history
        .filter((h) => (h.detail ?? "").includes(order.name) || a.allocations.some((al) => al.orderId === order.id && h.action === "Recorded arrival"))
        .map((h, i) => ({ ...h, action: h.action === "Recorded arrival" ? `Arrival ${a.name}` : `${a.name}: ${h.action.toLowerCase()}`, key: `${a.id}${i}` })),
    ),
  ].sort((x, y) => y.at.localeCompare(x.at));

  return (
    <>
      <SheetHeader className="gap-1 border-b p-4 pr-12">
        <div className="flex flex-wrap items-center gap-2">
          <SheetTitle className="font-mono text-lg">{order.name}</SheetTitle>
          <OrderBadge status={status} />
        </div>
        <SheetDescription>
          {units(order.units)} × {view.product?.name ?? "deleted product"} from {view.supplier?.name ?? "unknown supplier"} · ordered {formatDay(order.orderedOn)}
        </SheetDescription>
      </SheetHeader>

      <div className="grid gap-5 p-4">
        {view.alerts.map((a) => (
          <div
            key={a.kind}
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5",
              a.due ? "border-st-reorder/40 bg-st-reorder-bg" : "bg-muted/40",
            )}
          >
            <div className="min-w-0 text-sm">
              <div className={cn("font-medium", a.due && "text-st-reorder")}>{CHASE_LABEL[a.kind]}</div>
              <div className="text-xs text-muted-foreground">
                {a.reason}
                {!a.due && a.lastChasedAt && ` · followed up ${formatMoment(a.lastChasedAt)}, due again ${a.nextDueOn ? formatDay(a.nextDueOn) : ""}`}
              </div>
            </div>
            {!supplierMode && (
              <Button size="sm" variant={a.due ? "default" : "outline"} onClick={() => dialogs.chase(order.id, a.kind)}>
                <MailIcon /> {a.due ? "Prepare follow-up" : "Follow up anyway"}
              </Button>
            )}
          </div>
        ))}

        <div>
          <StageBar p={p} gone={status === "closed" ? p.remaining : 0} labels />
          {order.notes && <p className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-sm">{order.notes}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          {open && !p.confirmed && (
            <Button size="sm" onClick={() => run((s, a, now) => confirmOrder(s, order.id, a, now), `${order.name} confirmed`)}>
              <CheckCircle2Icon /> Mark confirmed
            </Button>
          )}
          {canTrack && (
            <Button size="sm" variant={p.confirmed ? "default" : "outline"} onClick={() => dialogs.tracking(order.id)}>
              <TruckIcon /> Add tracking
            </Button>
          )}
          {!supplierMode && open && p.remaining > 0 && (
            <Button size="sm" variant="outline" onClick={() => dialogs.arrival({ productId: order.productId, orderId: order.id, units: p.remaining })}>
              <PackageCheckIcon /> Record arrival
            </Button>
          )}
          {!supplierMode && (
            <Button size="sm" variant="outline" onClick={() => dialogs.orderMessage(order.id)}>
              <MailIcon /> Order message
            </Button>
          )}
          {!supplierMode && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" aria-label="More actions">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => dialogs.editOrder(order.id)}>
                  <PencilIcon /> Edit units, supplier, notes
                </DropdownMenuItem>
                {open && p.arrived > 0 && (
                  <DropdownMenuItem onSelect={() => setAsk("close")}>
                    <XCircleIcon /> Close: no more coming
                  </DropdownMenuItem>
                )}
                {open && p.arrived === 0 && (
                  <DropdownMenuItem onSelect={() => setAsk("cancel")}>
                    <BanIcon /> Cancel order
                  </DropdownMenuItem>
                )}
                {open && p.arrived === 0 && (
                  <DropdownMenuItem onSelect={() => setAsk("close")}>
                    <XCircleIcon /> Close: no more coming
                  </DropdownMenuItem>
                )}
                {!open && (
                  <DropdownMenuItem onSelect={() => run((s, a, now) => setOrderState(s, order.id, "open", a, now), `${order.name} reopened`)}>
                    <RotateCcwIcon /> Reopen
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setAsk("delete")}>
                  <Trash2Icon /> Delete order
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <section>
          <h3 className="mb-2 text-sm font-semibold">
            Tracking <span className="font-normal text-muted-foreground">· {units(p.tracked)} of {units(order.units)} units</span>
          </h3>
          {shipments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tracking yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {shipments.map(({ tracking: t, onTheWayUnits }) => {
                const url = trackingUrl(t);
                return (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2">
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono font-medium hover:underline">
                            {t.number} <ExternalLinkIcon className="size-3" />
                          </a>
                        ) : (
                          <span className="font-mono font-medium">{t.number}</span>
                        )}
                        <span className="text-xs text-muted-foreground">{t.carrier}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Shipped {formatDay(t.shippedOn)} · {onTheWayUnits === 0 ? "arrived" : onTheWayUnits === t.units ? "on the way" : `${units(onTheWayUnits)} still on the way`}
                      </div>
                    </div>
                    <span className="tnum font-medium">{units(t.units)}</span>
                    {!supplierMode && open && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove tracking ${t.number}`}
                        onClick={() => run((s, a, now) => removeTracking(s, order.id, t.id, a, now), "Tracking removed")}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {!supplierMode && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">
              Arrived <span className="font-normal text-muted-foreground">· {units(p.arrived)} units</span>
            </h3>
            {arrivals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing has arrived for this order.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {arrivals.map(({ a, units: n }) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span>
                      <span className="font-mono font-medium">{a.name}</span> <span className="text-muted-foreground">· {formatDay(a.receivedOn)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tnum font-medium">{units(n)}</span>
                      <Button variant="ghost" size="sm" onClick={() => dialogs.match(a.id)}>
                        Change match
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold">History</h3>
          <ol className="relative grid gap-3 border-l pl-4">
            {history.map((h) => (
              <li key={h.key} className="relative text-sm">
                <span className="absolute top-1.5 -left-[21px] size-2 rounded-full border-2 border-background bg-muted-foreground/60" />
                <div>
                  <span className="font-medium">{h.action}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · <Who actor={h.actor} /> · {formatMoment(h.at)}
                  </span>
                </div>
                {h.detail && <div className="text-xs text-muted-foreground">{h.detail}</div>}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <Confirm
        open={ask === "cancel"}
        onOpenChange={(o) => !o && setAsk(null)}
        title={`Cancel ${order.name}?`}
        body={`The supplier won't send these ${units(order.units)} units. It stops counting toward stock numbers. You can reopen it later.`}
        confirm="Cancel order"
        onConfirm={() => run((s, a, now) => setOrderState(s, order.id, "cancelled", a, now), `${order.name} cancelled`)}
      />
      <Confirm
        open={ask === "close"}
        onOpenChange={(o) => !o && setAsk(null)}
        title={`Close ${order.name}?`}
        body={`No more units are coming. ${units(p.arrived)} arrived; the other ${units(p.remaining)} stop counting toward stock numbers. You can reopen it later.`}
        confirm="Close order"
        onConfirm={() => run((s, a, now) => setOrderState(s, order.id, "closed", a, now), `${order.name} closed`)}
      />
      <Confirm
        open={ask === "delete"}
        onOpenChange={(o) => !o && setAsk(null)}
        title={`Delete ${order.name}?`}
        body={
          <>
            This removes the order and its history for good.
            {p.arrived > 0 && ` The ${units(p.arrived)} units that arrived for it stay in stock but become unmatched.`} Cancelling or closing keeps the record instead.
          </>
        }
        confirm="Delete order"
        destructive
        onConfirm={async () => {
          const ok = await run((s, a, now) => deleteOrder(s, order.id, a, now), `${order.name} deleted`);
          if (ok) onDeleted?.();
        }}
      />
    </>
  );
}
