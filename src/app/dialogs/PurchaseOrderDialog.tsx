import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DownloadIcon, PrinterIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { purchaseOrder } from "@/domain/po";
import { useApp } from "../context";
import { saveTextFile } from "../export";
import { PO_CSS, PurchaseOrderDoc, poDate } from "../components/PurchaseOrderDoc";
import { money } from "../format";

/** Injects the purchase order styles once. */
function usePoStyles() {
  useEffect(() => {
    if (document.getElementById("po-styles")) return;
    const el = Object.assign(document.createElement("style"), { id: "po-styles", textContent: PO_CSS });
    document.head.appendChild(el);
  }, []);
}

export function PurchaseOrderDialog({ orderIds, onClose }: { orderIds: string[]; onClose: () => void }) {
  const { data } = useApp();
  usePoStyles();
  const po = useMemo(() => purchaseOrder(data, orderIds), [data, orderIds]);
  const paper = useRef<HTMLElement>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return;
    let opened = false;
    const before = () => (opened = true);
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    document.body.classList.add("po-printing");
    // Let the print copy render first.
    const t = window.setTimeout(() => {
      window.print();
      if (!opened) {
        // Sandboxed views can block the print dialog without saying so.
        toast.error("Printing isn't allowed in this view. Download the purchase order and print it from there.");
        setPrinting(false);
      }
    }, 50);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      document.body.classList.remove("po-printing");
    };
  }, [printing]);

  if (!po) return null;

  const download = () => {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${po.number}</title><style>body{margin:0;background:#efebe5;padding:24px 12px}@media print{body{background:#fff;padding:0}}${PO_CSS}</style></head><body>${paper.current?.outerHTML ?? ""}</body></html>`;
    void saveTextFile(`${po.number}.html`, html, "text/html", "Use Print instead.");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 text-left">
          <DialogTitle>Purchase order {po.number}</DialogTitle>
          <DialogDescription>
            {po.supplier?.name ?? "Unknown supplier"} · {poDate(po.date)} · {money(po.subtotal)}
            {po.missingCost && " (some lines have no unit cost yet)"}. Print it or save it as a file to attach to the order email.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[oklch(0.93_0.01_75)] p-3 sm:p-6 dark:bg-[oklch(0.24_0.012_60)]">
          <div className="mx-auto max-w-[780px] rounded-sm shadow-[0_1px_2px_oklch(0_0_0/0.08),0_8px_28px_oklch(0_0_0/0.12)]">
            <PurchaseOrderDoc ref={paper} po={po} />
          </div>
        </div>
        <DialogFooter className="shrink-0 flex-row justify-end border-t px-5 py-3">
          <Button variant="outline" onClick={download}>
            <DownloadIcon /> Download
          </Button>
          <Button onClick={() => setPrinting(true)}>
            <PrinterIcon /> Print or save as PDF
          </Button>
        </DialogFooter>
      </DialogContent>
      {printing &&
        createPortal(
          <div className="po-print-root">
            <PurchaseOrderDoc po={po} />
          </div>,
          document.body,
        )}
    </Dialog>
  );
}
