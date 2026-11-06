import { useEffect, useMemo, useState } from "react";
import { CheckIcon, ChevronDownIcon, FileTextIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDay } from "@/domain/dates";
import { tryOrderDays } from "@/domain/forecast";
import { batchOrderMessage, orderMessage, type Draft } from "@/domain/messages";
import { createOrders, merge, recordBatchMessage, recordOrderMessage } from "@/domain/mutations";
import { purchaseOrder } from "@/domain/po";
import { DUE_SOON_DAYS, reorderPlan, type PlanLine } from "@/domain/reorder";
import type { Supplier, SupplierOrder } from "@/domain/types";
import { useApp } from "../context";
import { CopyButton, UnitsInput, toInt } from "../components/bits";
import { dec1, money, plural, price } from "../format";
import { PurchaseOrderDialog } from "./PurchaseOrderDialog";
import { ProductThumb } from "../components/ProductThumb";

interface Pick {
  on: boolean;
  units: string;
}

/**
 * Every product past its reorder line, plus the ones that cross it within two
 * weeks, grouped by supplier so they go out together. Step 1 places the
 * orders; step 2 prepares one message and one purchase order per supplier.
 */
export function ReorderPlanDialog({ onClose }: { onClose: () => void }) {
  const { report, run } = useApp();
  const plan = useMemo(() => reorderPlan(report), [report]);
  const [picks, setPicks] = useState<Record<string, Pick>>(() =>
    Object.fromEntries(plan.map((l) => [l.row.product.id, { on: l.due === "now" && l.units > 0, units: String(l.units || "") }])),
  );
  const [placed, setPlaced] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<string, { supplier: Supplier | undefined; lines: PlanLine[] }>();
    for (const l of plan) {
      const key = l.row.product.supplierId;
      const g = m.get(key) ?? { supplier: l.row.supplier, lines: [] };
      g.lines.push(l);
      m.set(key, g);
    }
    return [...m.values()];
  }, [plan]);

  if (placed) return <SendStep orderIds={placed} onClose={onClose} />;

  const chosen = plan.filter((l) => picks[l.row.product.id]?.on && toInt(picks[l.row.product.id].units) > 0);
  const lineCost = (l: PlanLine) => (l.row.product.unitCost ?? 0) * (toInt(picks[l.row.product.id]?.units ?? "") || 0);
  const total = chosen.reduce((s, l) => s + lineCost(l), 0);
  const nowCount = plan.filter((l) => l.due === "now").length;
  const set = (id: string, p: Partial<Pick>) => setPicks((x) => ({ ...x, [id]: { ...x[id], ...p } }));

  const place = async () => {
    setBusy(true);
    let ids: string[] = [];
    const ok = await run((s, a, now) => {
      const { orders, changes } = createOrders(
        s,
        chosen.map((l) => ({ productId: l.row.product.id, supplierId: l.row.product.supplierId, units: toInt(picks[l.row.product.id].units), notes: "", orderedOn: report.today })),
        a,
        now,
      );
      ids = orders.map((o) => o.id);
      return changes;
    }, `${plural(chosen.length, "order")} placed`);
    setBusy(false);
    if (ok) setPlaced(ids);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 text-left">
          <DialogTitle>Plan reorders</DialogTitle>
          <DialogDescription>
            {nowCount > 0 ? `${plural(nowCount, "product")} past the reorder line` : "Nothing is past the reorder line"}
            {plan.length > nowCount && `, ${plan.length - nowCount} more crossing it within ${DUE_SOON_DAYS} days`}. Units start at the suggested order; each goes to its usual supplier.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {plan.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">Nothing is due in the next {DUE_SOON_DAYS} days. Every product has enough on hand and on order.</p>
          ) : (
            groups.map((g) => {
              const sub = g.lines.filter((l) => chosen.includes(l)).reduce((s, l) => s + lineCost(l), 0);
              const n = g.lines.filter((l) => chosen.includes(l)).length;
              return (
                <section key={g.supplier?.id ?? "none"} className="border-b last:border-0">
                  <div className="flex items-baseline justify-between gap-3 bg-muted/40 px-5 py-2">
                    <h3 className="truncate text-sm font-semibold">{g.supplier?.name ?? "No supplier"}</h3>
                    <span className="tnum shrink-0 text-xs text-muted-foreground">{n ? `${plural(n, "order")} · ${money(sub)}` : "nothing picked"}</span>
                  </div>
                  <ul className="divide-y">
                    {g.lines.map((l) => {
                      const id = l.row.product.id;
                      const p = picks[id] ?? { on: false, units: String(l.units || "") };
                      const n2 = toInt(p.units) || 0;
                      const f = l.row.forecast;
                      const after = tryOrderDays(f, p.on ? n2 : 0);
                      return (
                        <li key={id} className={cn("grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 px-5 py-3 sm:grid-cols-[auto_1fr_auto_6.5rem]", !p.on && "opacity-70")}>
                          <input
                            type="checkbox"
                            id={`rp-${id}`}
                            checked={p.on}
                            onChange={(e) => set(id, { on: e.target.checked })}
                            className="mt-1 size-4 accent-foreground"
                          />
                          <label htmlFor={`rp-${id}`} className="min-w-0 cursor-pointer">
                            <span className="flex flex-wrap items-center gap-x-2">
                              <ProductThumb product={l.row.product} size="xs" className="-my-1 mr-0.5" />
                              <span className="text-sm font-medium">{l.row.product.name}</span>
                              <span
                                className={cn(
                                  "rounded px-1.5 text-[11px] font-medium",
                                  l.due === "now" ? "bg-st-reorder-bg text-st-reorder" : "bg-muted text-muted-foreground",
                                )}
                              >
                                {l.due === "now" ? (l.dueOn < report.today ? `Due since ${formatDay(l.dueOn)}` : "Due today") : `Due ${formatDay(l.dueOn)}`}
                              </span>
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {f.daysWithOrdered === null ? "No recent sales" : `${dec1(f.daysWithOrdered)} d with everything ordered`}
                              {p.on && after !== null && n2 > 0 && (
                                <>
                                  {" → "}
                                  <span className="font-medium text-foreground">{dec1(after)} d</span>
                                </>
                              )}
                              {" · line at "}
                              {f.reorderLine} d
                            </span>
                          </label>
                          <div className="col-start-2 flex items-center gap-2 sm:col-start-3 sm:row-start-1">
                            <UnitsInput id={`rp-units-${id}`} value={p.units} onChange={(v) => set(id, { units: v, on: toInt(v) > 0 ? true : p.on })} className="w-24" aria-label={`Units of ${l.row.product.name}`} />
                            <span className="text-xs text-muted-foreground sm:hidden">units</span>
                          </div>
                          <div className="col-start-2 text-sm sm:col-start-4 sm:row-start-1 sm:self-center sm:text-right">
                            <div className="tnum font-medium">{l.row.product.unitCost === undefined ? "No cost" : money(lineCost(l))}</div>
                            {l.row.product.unitCost !== undefined && <div className="tnum text-xs text-muted-foreground">at {price(l.row.product.unitCost)}</div>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>

        <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
          <div className="tnum text-sm">
            <span className="font-semibold">{plural(chosen.length, "order")}</span>
            <span className="text-muted-foreground"> · {money(total)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={busy || chosen.length === 0} onClick={place}>
              Place {plural(chosen.length, "order")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Step 2: one message and one purchase order per supplier. */
function SendStep({ orderIds, onClose }: { orderIds: string[]; onClose: () => void }) {
  const { data, run } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [po, setPo] = useState<string[] | null>(null);

  const batches = useMemo(() => {
    const orders = orderIds.map((id) => data.orders.find((o) => o.id === id)).filter((o): o is SupplierOrder => !!o);
    const m = new Map<string, SupplierOrder[]>();
    for (const o of orders) m.set(o.supplierId, [...(m.get(o.supplierId) ?? []), o]);
    return [...m.entries()].map(([supplierId, os]) => {
      const supplier = data.suppliers.find((s) => s.id === supplierId);
      const doc = purchaseOrder(data, os.map((o) => o.id))!;
      const draft: Draft =
        os.length === 1
          ? orderMessage(os[0], data.products.find((p) => p.id === os[0].productId), supplier, data.settings)
          : batchOrderMessage(os, data.products, supplier, data.settings, doc.number);
      return { supplierId, supplier, orders: os, doc, draft };
    });
  }, [data, orderIds]);

  // Undone from the toast: nothing left to send.
  useEffect(() => {
    if (!batches.length) onClose();
  }, [batches.length, onClose]);
  if (!batches.length) return null;

  const all = batches.map((b) => `To: ${b.draft.to.join(", ")}\nSubject: ${b.draft.subject}\n\n${b.draft.body}`).join("\n\n----------\n\n");

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-full bg-st-ok-bg text-st-ok">
                <CheckIcon className="size-3.5" />
              </span>
              {plural(orderIds.length, "order")} placed
            </DialogTitle>
            <DialogDescription>
              Now tell {batches.length === 1 ? "the supplier" : `the ${batches.length} suppliers`}: one message and one purchase order each. Email is in test
              mode, so copy the messages into your email, then mark them sent.
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-lg border">
            {batches.map((b) => {
              const isOpen = open === b.supplierId;
              return (
                <li key={b.supplierId}>
                  <div className="flex items-start gap-2 px-3 py-2.5">
                    <button
                      className="min-w-0 flex-1 text-left focus-visible:outline-none"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : b.supplierId)}
                    >
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {b.supplier?.name ?? "Unknown supplier"}
                        <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {b.orders.map((o) => o.name).join(", ")} · {money(b.doc.subtotal)}
                      </div>
                    </button>
                    <Button size="sm" variant="outline" onClick={() => setPo(b.orders.map((o) => o.id))}>
                      <FileTextIcon /> {b.doc.number}
                    </Button>
                  </div>
                  {isOpen && (
                    <pre className="border-t bg-muted/30 px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                      {`To: ${b.draft.to.join(", ")}\nSubject: ${b.draft.subject}\n\n${b.draft.body}`}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
          <DialogFooter className="gap-2 sm:justify-between">
            <CopyButton text={all} label={batches.length === 1 ? "Copy message" : `Copy all ${batches.length}`} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Later
              </Button>
              <Button
                onClick={async () => {
                  const ok = await run(
                    (s, a, now) =>
                      merge(
                        ...batches.map((b) =>
                          b.orders.length === 1 ? recordOrderMessage(s, b.orders[0].id, b.draft, a, now) : recordBatchMessage(s, b.orders.map((o) => o.id), b.draft, a, now),
                        ),
                      ),
                    `${plural(batches.length, "message")} logged (test mode, not delivered)`,
                  );
                  if (ok) onClose();
                }}
              >
                <SendIcon /> Mark {batches.length === 1 ? "it" : `all ${batches.length}`} sent
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {po && <PurchaseOrderDialog orderIds={po} onClose={() => setPo(null)} />}
    </>
  );
}
