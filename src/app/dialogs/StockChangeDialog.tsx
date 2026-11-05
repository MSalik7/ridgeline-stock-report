import { useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { logStockChange } from "@/domain/mutations";
import type { StockChangeKind } from "@/domain/types";
import { useApp } from "../context";
import { Field, UnitsInput, toInt } from "../components/bits";
import { ProductSelect } from "./OrderDialogs";
import { units as fmtUnits } from "../format";

export function StockChangeDialog({ productId: initial, onClose }: { productId?: string; onClose: () => void }) {
  const { data, report, run } = useApp();
  const [productId, setProductId] = useState(initial ?? data.products[0]?.id ?? "");
  const [kind, setKind] = useState<StockChangeKind>("manual_sale");
  const [direction, setDirection] = useState<"add" | "remove">("remove");
  const [unitsText, setUnits] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(report.today);
  const n = toInt(unitsText) || 0;
  const signed = kind === "manual_sale" ? -n : direction === "add" ? n : -n;
  const row = report.products.find((r) => r.product.id === productId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a stock change</DialogTitle>
          <DialogDescription>For anything the store and warehouse feeds don't cover. The note is the "why" in stock history.</DialogDescription>
        </DialogHeader>
        <form
          id="stock-change-form"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(
              (s, a, now) => logStockChange(s, { productId, kind, units: signed, note, on: date }, a, now),
              kind === "manual_sale" ? "Sale logged" : "Adjustment logged",
            );
            if (ok) onClose();
          }}
        >
          <Field id="sc-product" label="Product">
            <ProductSelect id="sc-product" value={productId} onChange={setProductId} />
          </Field>
          <ToggleGroup
            type="single"
            variant="outline"
            value={kind}
            onValueChange={(v) => v && setKind(v as StockChangeKind)}
            className="w-full"
          >
            <ToggleGroupItem value="manual_sale" className="flex-1">
              Manual sale
            </ToggleGroupItem>
            <ToggleGroupItem value="adjustment" className="flex-1">
              Adjustment
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="-mt-2 text-xs text-muted-foreground">
            {kind === "manual_sale"
              ? "A sale outside the online store, like wholesale or a market stall. Leaves stock now and counts toward sales speed."
              : "A correction: damage, a recount, a found carton. Changes stock only, not sales speed."}
          </p>
          <div className="grid grid-cols-[auto_1fr_auto] items-end gap-2">
            {kind === "adjustment" ? (
              <ToggleGroup
                type="single"
                variant="outline"
                value={direction}
                onValueChange={(v) => v && setDirection(v as "add" | "remove")}
                aria-label="Add or remove units"
              >
                <ToggleGroupItem value="remove" aria-label="Remove units">
                  <MinusIcon />
                </ToggleGroupItem>
                <ToggleGroupItem value="add" aria-label="Add units">
                  <PlusIcon />
                </ToggleGroupItem>
              </ToggleGroup>
            ) : (
              <span />
            )}
            <Field id="sc-units" label="Units">
              <UnitsInput id="sc-units" value={unitsText} onChange={setUnits} autoFocus />
            </Field>
            <Field id="sc-date" label="Date">
              <Input id="sc-date" type="date" value={date} max={report.today} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          {row && n > 0 && (
            <p className="tnum text-sm text-muted-foreground">
              Warehouse stock {fmtUnits(row.stock)} → <span className="font-semibold text-foreground">{fmtUnits(row.stock + signed)}</span>
            </p>
          )}
          <Field id="sc-note" label="Why">
            <Input
              id="sc-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={kind === "manual_sale" ? "Wholesale to Corvus Coffee" : "Two cracked in storage"}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="stock-change-form" disabled={!productId || n <= 0 || !note.trim()}>
            Log change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
