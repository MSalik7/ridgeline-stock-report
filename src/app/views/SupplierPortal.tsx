import { useState } from "react";
import { CheckCircle2Icon, TruckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatDay } from "@/domain/dates";
import { confirmOrder } from "@/domain/mutations";
import { useApp } from "../context";
import { useDialogs } from "../dialogs/DialogProvider";
import { OrderBadge } from "../components/badges";
import { StageBar } from "../components/charts";
import { EmptyState, PageHeader } from "../components/bits";
import { units } from "../format";
import { OrderDetail } from "./OrderSheet";

/** What a supplier sees: only their own orders, and only confirm + add tracking. */
export function SupplierPortal() {
  const { report, viewer, data, run } = useApp();
  const dialogs = useDialogs();
  const [openId, setOpenId] = useState<string | null>(null);
  const supplier = data.suppliers.find((s) => s.id === viewer.supplierId);
  const mine = report.orders.filter((o) => o.order.supplierId === viewer.supplierId && o.status !== "cancelled");
  const open = mine.filter((o) => o.open);
  const done = mine.filter((o) => !o.open);
  const needsMe = open.filter((o) => !o.progress.confirmed || o.progress.untracked > 0);
  const view = openId ? report.orderById.get(openId) : undefined;

  if (!supplier) return <EmptyState title="Supplier not found">Switch role from the menu.</EmptyState>;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={supplier.name}
        description={`Your orders from ${data.settings.storeName}. Confirm new orders and add tracking numbers when units ship.`}
      />
      <div className="grid grid-cols-3 gap-3">
        <PortalStat label="Open orders" value={open.length} />
        <PortalStat label="To confirm" value={open.filter((o) => !o.progress.confirmed).length} />
        <PortalStat label="Units without tracking" value={open.filter((o) => o.progress.confirmed).reduce((s, o) => s + o.progress.untracked, 0)} />
      </div>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold">Open orders</h2>
        {open.length === 0 && <EmptyState title="No open orders">New orders appear here as soon as they're placed.</EmptyState>}
        {open.map((o) => {
          const p = o.progress;
          const waiting = needsMe.includes(o);
          return (
            <article key={o.order.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button className="text-left" onClick={() => setOpenId(o.order.id)}>
                  <div className="font-mono font-semibold hover:underline">{o.order.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {units(o.order.units)} × {o.product?.name} · ordered {formatDay(o.order.orderedOn)}
                  </div>
                </button>
                <OrderBadge status={o.status} />
              </div>
              {o.order.notes && <p className="mt-2 text-sm">{o.order.notes}</p>}
              <StageBar p={p} labels className="mt-3" />
              {waiting && (
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                  {!p.confirmed && (
                    <Button size="sm" onClick={() => run((s, a, now) => confirmOrder(s, o.order.id, a, now), `${o.order.name} confirmed`)}>
                      <CheckCircle2Icon /> Confirm order
                    </Button>
                  )}
                  {o.order.units - p.tracked > 0 && (
                    <Button size="sm" variant={p.confirmed ? "default" : "outline"} onClick={() => dialogs.tracking(o.order.id)}>
                      <TruckIcon /> Add tracking ({units(o.order.units - p.tracked)} units left)
                    </Button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </section>

      {done.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold">Finished</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {done.map((o) => (
              <li key={o.order.id}>
                <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/40" onClick={() => setOpenId(o.order.id)}>
                  <span className="text-sm">
                    <span className="font-mono font-medium">{o.order.name}</span>{" "}
                    <span className="text-muted-foreground">· {units(o.order.units)} × {o.product?.name}</span>
                  </span>
                  <OrderBadge status={o.status} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Sheet open={!!view} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">{view && <OrderDetail view={view} supplierMode />}</SheetContent>
      </Sheet>
    </div>
  );
}

function PortalStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tnum mt-1 text-2xl font-semibold tracking-tight">{units(value)}</div>
    </div>
  );
}
