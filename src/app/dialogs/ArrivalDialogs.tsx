import { useMemo, useState } from "react";
import { WandSparklesIcon, HandIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { autoMatch, openCapacities, type OrderCapacity } from "@/domain/arrivals";
import { formatDay } from "@/domain/dates";
import { recordArrival, rematchArrival } from "@/domain/mutations";
import type { Allocation, SupplierOrder } from "@/domain/types";
import { cn } from "@/lib/utils";
import { useApp } from "../context";
import { Field, UnitsInput, toInt } from "../components/bits";
import { ProductSelect } from "./OrderDialogs";
import { units as fmtUnits } from "../format";

interface Candidate {
  order: SupplierOrder;
  capacity: number;
}

/** Hand-matching editor: units per order, plus "not from an order". */
function AllocationEditor({
  total,
  candidates,
  values,
  setValues,
}: {
  total: number;
  candidates: Candidate[];
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
}) {
  const assigned = Object.values(values).reduce((s, v) => s + (toInt(v) || 0), 0);
  const left = total - assigned;
  return (
    <div className="grid gap-2">
      {candidates.map((c) => {
        const n = toInt(values[c.order.id] ?? "") || 0;
        return (
          <div key={c.order.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-sm font-medium">{c.order.name}</div>
              <div className={cn("text-xs", n > c.capacity ? "text-destructive" : "text-muted-foreground")}>
                Ordered {formatDay(c.order.orderedOn)} · can take {fmtUnits(c.capacity)}
              </div>
            </div>
            <UnitsInput
              id={`al-${c.order.id}`}
              value={values[c.order.id] ?? ""}
              onChange={(v) => setValues({ ...values, [c.order.id]: v })}
              placeholder="0"
              className="w-24 text-right"
            />
          </div>
        );
      })}
      <div className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Not from an order</div>
          <div className="text-xs text-muted-foreground">Samples, returns, extras. Counted in stock, matched to nothing.</div>
        </div>
        <UnitsInput id="al-none" value={values.none ?? ""} onChange={(v) => setValues({ ...values, none: v })} placeholder="0" className="w-24 text-right" />
      </div>
      <div className={cn("tnum text-sm", left < 0 ? "text-destructive" : left > 0 ? "text-st-urgent" : "text-muted-foreground")}>
        {fmtUnits(assigned)} of {fmtUnits(total)} assigned
        {left > 0 && ` · ${fmtUnits(left)} stay unmatched and show on the arrivals page`}
        {left < 0 && ` · ${fmtUnits(-left)} too many`}
      </div>
    </div>
  );
}

function toAllocations(values: Record<string, string>): Allocation[] {
  return Object.entries(values).map(([k, v]) => ({ orderId: k === "none" ? null : k, units: toInt(v) || 0 }));
}

function AutoPreview({ allocations, total, caps }: { allocations: Allocation[]; total: number; caps: OrderCapacity[] }) {
  const names = new Map(caps.map((c) => [c.order.id, c]));
  const used = allocations.reduce((s, a) => s + a.units, 0);
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <WandSparklesIcon className="size-3.5" /> Oldest open order first
      </div>
      {allocations.length === 0 && <div className="text-muted-foreground">No open orders for this product.</div>}
      <ul className="grid gap-1">
        {allocations.map((a) => {
          const c = names.get(a.orderId!);
          return (
            <li key={a.orderId} className="flex justify-between gap-3">
              <span>
                <span className="font-mono">{c?.order.name}</span>{" "}
                <span className="text-muted-foreground">
                  {a.units === c?.capacity ? "fills it" : `${fmtUnits(c!.capacity - a.units)} still to come`}
                </span>
              </span>
              <span className="tnum font-medium">{fmtUnits(a.units)}</span>
            </li>
          );
        })}
        {total - used > 0 && (
          <li className="flex justify-between gap-3 text-st-urgent">
            <span>Unmatched, needs someone to check</span>
            <span className="tnum font-medium">{fmtUnits(total - used)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

export function ArrivalDialog({
  productId: initialProduct,
  orderId,
  units: initialUnits,
  onClose,
}: {
  productId?: string;
  orderId?: string;
  units?: number;
  onClose: () => void;
}) {
  const { data, report, run } = useApp();
  const fromOrder = orderId ? report.orderById.get(orderId) : undefined;
  const [productId, setProductId] = useState(initialProduct ?? fromOrder?.order.productId ?? data.products[0]?.id ?? "");
  const [unitsText, setUnits] = useState(initialUnits ? String(initialUnits) : "");
  const [date, setDate] = useState(report.today);
  const [note, setNote] = useState("");
  const [manual, setManual] = useState(!!orderId);
  const [values, setValues] = useState<Record<string, string>>(orderId && initialUnits ? { [orderId]: String(initialUnits) } : {});
  const total = toInt(unitsText) || 0;
  const caps = useMemo(() => openCapacities(data, productId), [data, productId]);
  const preview = useMemo(() => autoMatch(total, caps), [total, caps]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a warehouse arrival</DialogTitle>
          <DialogDescription>Units are added to stock and matched to this product's open supplier orders.</DialogDescription>
        </DialogHeader>
        <form
          id="arrival-form"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(
              (s, a, now) =>
                recordArrival(
                  s,
                  { productId, units: total, receivedOn: date, note, allocations: manual ? toAllocations(values) : undefined },
                  a,
                  now,
                ).changes,
              "Arrival recorded",
            );
            if (ok) onClose();
          }}
        >
          <Field id="ar-product" label="Product">
            <ProductSelect
              id="ar-product"
              value={productId}
              onChange={(v) => {
                setProductId(v);
                setValues({});
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="ar-units" label="Units received">
              <UnitsInput id="ar-units" value={unitsText} onChange={setUnits} autoFocus />
            </Field>
            <Field id="ar-date" label="Received on">
              <Input id="ar-date" type="date" value={date} max={report.today} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field id="ar-note" label="Note" hint="Optional: carton count, damage, packing slip.">
            <Input id="ar-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Match to orders</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setManual((m) => !m)}>
                {manual ? <WandSparklesIcon /> : <HandIcon />}
                {manual ? "Match automatically" : "Match by hand"}
              </Button>
            </div>
            {total > 0 &&
              (manual ? (
                <AllocationEditor total={total} candidates={caps} values={values} setValues={setValues} />
              ) : (
                <AutoPreview allocations={preview} total={total} caps={caps} />
              ))}
            {total === 0 && <p className="text-xs text-muted-foreground">Enter the units to see how they'll be matched.</p>}
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="arrival-form" disabled={!productId || total <= 0}>
            Record arrival
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MatchDialog({ arrivalId, onClose }: { arrivalId: string; onClose: () => void }) {
  const { data, run } = useApp();
  const arrival = data.arrivals.find((a) => a.id === arrivalId);
  const candidates = useMemo<Candidate[]>(() => {
    if (!arrival) return [];
    const caps = openCapacities(data, arrival.productId, arrival.id);
    const list: Candidate[] = caps.map((c) => ({ order: c.order, capacity: c.capacity }));
    // Orders this arrival already feeds stay listed even if they've since closed.
    for (const al of arrival.allocations) {
      if (al.orderId && !list.some((c) => c.order.id === al.orderId)) {
        const o = data.orders.find((x) => x.id === al.orderId);
        if (o) list.push({ order: o, capacity: al.units });
      }
    }
    return list.sort((a, b) => a.order.orderedOn.localeCompare(b.order.orderedOn));
  }, [data, arrival]);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const al of arrival?.allocations ?? []) v[al.orderId ?? "none"] = String(al.units);
    return v;
  });
  if (!arrival) return null;
  const product = data.products.find((p) => p.id === arrival.productId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change the match for {arrival.name}</DialogTitle>
          <DialogDescription>
            {fmtUnits(arrival.units)} × {product?.name} received {formatDay(arrival.receivedOn)}. Split it across orders or mark units as not from an order. Stock stays the same; the move is logged in stock history.
          </DialogDescription>
        </DialogHeader>
        <form
          id="match-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run((s, a, now) => rematchArrival(s, arrivalId, toAllocations(values), a, now), "Match updated");
            if (ok) onClose();
          }}
        >
          <AllocationEditor total={arrival.units} candidates={candidates} values={values} setValues={setValues} />
        </form>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const auto = autoMatch(arrival.units, openCapacities(data, arrival.productId, arrival.id));
              setValues(Object.fromEntries(auto.map((a) => [a.orderId!, String(a.units)])));
            }}
          >
            <WandSparklesIcon /> Refill oldest first
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="match-form">
              Save match
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
