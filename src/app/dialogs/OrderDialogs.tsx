import { useMemo, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addDays, formatDay } from "@/domain/dates";
import { tryOrderDays } from "@/domain/forecast";
import { addTracking, createOrder, editOrder, orderName } from "@/domain/mutations";
import { guessCarrier } from "@/domain/orders";
import type { Carrier } from "@/domain/types";
import { useApp } from "../context";
import { Field, UnitsInput, toInt } from "../components/bits";
import { CoverageBar } from "../components/charts";
import { days as fmtDays, money, price, units as fmtUnits } from "../format";

export function ProductSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { data } = useApp();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Choose a product" />
      </SelectTrigger>
      <SelectContent>
        {data.products.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <span className="font-mono text-xs text-muted-foreground">{p.code}</span> {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SupplierSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { data } = useApp();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Choose a supplier" />
      </SelectTrigger>
      <SelectContent>
        {data.suppliers.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function NewOrderDialog({
  productId: initialProduct,
  units: initialUnits,
  onClose,
  onCreated,
}: {
  productId?: string;
  units?: number;
  onClose: () => void;
  onCreated: (orderId: string) => void;
}) {
  const { report, run } = useApp();
  const [productId, setProductId] = useState(initialProduct ?? report.products[0]?.product.id ?? "");
  const row = report.products.find((r) => r.product.id === productId);
  const [supplierId, setSupplierId] = useState(row?.product.supplierId ?? "");
  const [unitsText, setUnits] = useState(String(initialUnits ?? row?.forecast.suggestedOrder ?? ""));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const n = toInt(unitsText);

  const pickProduct = (id: string) => {
    setProductId(id);
    const r = report.products.find((x) => x.product.id === id);
    if (r) {
      setSupplierId(r.product.supplierId);
      setUnits(String(r.forecast.suggestedOrder || ""));
    }
  };

  const after = row && Number.isFinite(n) ? tryOrderDays(row.forecast, n) : null;
  const nextName = row ? orderName(row.product.code, row.product.nextOrderSeq) : "";

  const submit = async () => {
    setBusy(true);
    let createdId = "";
    const ok = await run((s, actor, now) => {
      const { order, changes } = createOrder(s, { productId, supplierId, units: n, notes, orderedOn: report.today }, actor, now);
      createdId = order.id;
      return changes;
    }, "Order placed");
    setBusy(false);
    if (ok) onCreated(createdId);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New supplier order</DialogTitle>
          <DialogDescription>
            {nextName ? (
              <>
                It will be named <span className="font-mono text-foreground">{nextName}</span>. You can send the supplier the order message next.
              </>
            ) : (
              "Pick a product to start."
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          id="new-order-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="no-product" label="Product">
              <ProductSelect id="no-product" value={productId} onChange={pickProduct} />
            </Field>
            <Field id="no-supplier" label="Supplier">
              <SupplierSelect id="no-supplier" value={supplierId} onChange={setSupplierId} />
            </Field>
          </div>
          <Field
            id="no-units"
            label="Units"
            hint={
              row ? (
                <>
                  Suggested order: {fmtUnits(row.forecast.suggestedOrder)} units (covers lead time + target days).
                  {row.product.unitCost !== undefined && n > 0 && (
                    <span className="block text-foreground/80">
                      {fmtUnits(n)} × {price(row.product.unitCost)} = <span className="tnum font-medium">{money(n * row.product.unitCost)}</span>
                    </span>
                  )}
                </>
              ) : undefined
            }
          >
            <UnitsInput id="no-units" value={unitsText} onChange={setUnits} autoFocus />
          </Field>
          {row && row.forecast.adjustedBurn > 0 && (
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Days of stock with everything ordered</span>
                <span className="tnum">
                  <span className="text-muted-foreground">{fmtDays(row.forecast.daysWithOrdered)} → </span>
                  <span className="font-semibold">{fmtDays(after)}</span>
                </span>
              </div>
              <CoverageBar f={row.forecast} tryUnits={Number.isFinite(n) ? n : 0} />
              {after !== null && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {after < row.forecast.reorderLine
                    ? `Still under the ${row.forecast.reorderLine}-day reorder line.`
                    : `Lasts until about ${formatDay(addDays(report.today, Math.floor(after)))}.`}
                </p>
              )}
            </div>
          )}
          <Field id="no-notes" label="Notes" hint="Optional. Included in the order message.">
            <Textarea id="no-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Colorway, packaging, rush…" />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-order-form" disabled={busy || !productId || !supplierId || !(n > 0)}>
            Place order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditOrderDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { data, report, run } = useApp();
  const view = report.orderById.get(orderId);
  const [unitsText, setUnits] = useState(String(view?.order.units ?? ""));
  const [notes, setNotes] = useState(view?.order.notes ?? "");
  const [supplierId, setSupplierId] = useState(view?.order.supplierId ?? "");
  if (!view) return null;
  const min = Math.max(view.progress.tracked, view.progress.arrived);
  void data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {view.order.name}</DialogTitle>
          <DialogDescription>Changes are recorded in the order's history.</DialogDescription>
        </DialogHeader>
        <form
          id="edit-order-form"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run((s, a, now) => editOrder(s, orderId, { units: toInt(unitsText), notes, supplierId }, a, now), "Order updated");
            if (ok) onClose();
          }}
        >
          <Field id="eo-units" label="Units" hint={min > 0 ? `At least ${fmtUnits(min)}: that many already have tracking or arrived.` : undefined}>
            <UnitsInput id="eo-units" value={unitsText} onChange={setUnits} />
          </Field>
          <Field id="eo-supplier" label="Supplier">
            <SupplierSelect id="eo-supplier" value={supplierId} onChange={setSupplierId} />
          </Field>
          <Field id="eo-notes" label="Notes">
            <Textarea id="eo-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-order-form">
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CARRIERS: Carrier[] = ["UPS", "FedEx", "USPS", "DHL", "Other"];

interface Row {
  key: number;
  number: string;
  carrier: Carrier;
  carrierTouched: boolean;
  units: string;
  shippedOn: string;
}

export function TrackingDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { report, run } = useApp();
  const view = report.orderById.get(orderId);
  const room = view ? view.order.units - view.progress.tracked : 0;
  const [rows, setRows] = useState<Row[]>([
    { key: 1, number: "", carrier: "UPS", carrierTouched: false, units: String(Math.max(0, room)), shippedOn: report.today },
  ]);
  const total = useMemo(() => rows.reduce((s, r) => s + (toInt(r.units) || 0), 0), [rows]);
  if (!view) return null;
  const over = total > room;

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.number !== undefined && !r.carrierTouched) next.carrier = guessCarrier(patch.number) ?? r.carrier;
        return next;
      }),
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add tracking to {view.order.name}</DialogTitle>
          <DialogDescription>
            {fmtUnits(view.order.units)} units ordered, {fmtUnits(view.progress.tracked)} already tracked.{" "}
            <span className={over ? "font-medium text-destructive" : "font-medium text-foreground"}>
              {fmtUnits(Math.max(0, room - total))} of {fmtUnits(room)} left to track
            </span>
            . You can add the rest later.
          </DialogDescription>
        </DialogHeader>
        <form
          id="tracking-form"
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(
              (s, a, now) =>
                addTracking(
                  s,
                  orderId,
                  rows.map((r) => ({ number: r.number, carrier: r.carrier, units: toInt(r.units), shippedOn: r.shippedOn })),
                  a,
                  now,
                ),
              rows.length > 1 ? "Tracking numbers added" : "Tracking added",
            );
            if (ok) onClose();
          }}
        >
          {rows.map((r, i) => (
            <div key={r.key} className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_7rem_5.5rem_9rem_auto] sm:items-end sm:border-0 sm:p-0">
              <Field id={`tr-num-${r.key}`} label={i === 0 ? "Tracking number" : <span className="sm:sr-only">Tracking number</span>} className="col-span-2 sm:col-span-1">
                <Input
                  id={`tr-num-${r.key}`}
                  value={r.number}
                  autoFocus={i === 0}
                  className="font-mono"
                  placeholder="1Z… / 7729…"
                  onChange={(e) => update(r.key, { number: e.target.value })}
                />
              </Field>
              <Field id={`tr-car-${r.key}`} label={i === 0 ? "Carrier" : <span className="sm:sr-only">Carrier</span>}>
                <Select value={r.carrier} onValueChange={(v) => update(r.key, { carrier: v as Carrier, carrierTouched: true })}>
                  <SelectTrigger id={`tr-car-${r.key}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARRIERS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id={`tr-units-${r.key}`} label={i === 0 ? "Units" : <span className="sm:sr-only">Units</span>}>
                <UnitsInput id={`tr-units-${r.key}`} value={r.units} onChange={(v) => update(r.key, { units: v })} />
              </Field>
              <Field id={`tr-date-${r.key}`} label={i === 0 ? "Shipped on" : <span className="sm:sr-only">Shipped on</span>}>
                <Input id={`tr-date-${r.key}`} type="date" value={r.shippedOn} max={report.today} onChange={(e) => update(r.key, { shippedOn: e.target.value })} />
              </Field>
              <div className="flex justify-end sm:pb-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove this tracking number"
                  disabled={rows.length === 1}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setRows((rs) => [
                  ...rs,
                  { key: Date.now(), number: "", carrier: "UPS", carrierTouched: false, units: String(Math.max(0, room - total)), shippedOn: report.today },
                ])
              }
            >
              <PlusIcon /> Another tracking number
            </Button>
          </div>
          {over && (
            <p className="text-sm text-destructive">
              These add up to {fmtUnits(total)} units, but only {fmtUnits(room)} can still get tracking.
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="tracking-form" disabled={over || rows.some((r) => !r.number.trim() || !(toInt(r.units) > 0))}>
            Save tracking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
