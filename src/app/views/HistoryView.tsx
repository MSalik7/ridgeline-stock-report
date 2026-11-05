import { useMemo, useState } from "react";
import { ClipboardPenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDay, formatMoment } from "@/domain/dates";
import { LEDGER_LABEL, stockLedger, type LedgerKind } from "@/domain/stock";
import { useApp } from "../context";
import { useDialogs } from "../dialogs/DialogProvider";
import { PageHeader, Who, go } from "../components/bits";
import { units } from "../format";

type Kind = "all" | "arrival" | "shipped" | "manual" | "rematch";
const KINDS: { value: Kind; label: string; match: LedgerKind[] }[] = [
  { value: "all", label: "Everything", match: [] },
  { value: "arrival", label: "Arrivals", match: ["arrival", "count"] },
  { value: "rematch", label: "Moves and corrections", match: ["rematch", "correction"] },
  { value: "manual", label: "Manual changes", match: ["manual_sale", "adjustment"] },
  { value: "shipped", label: "Shipped to customers", match: ["shipped"] },
];

export function HistoryView({ productId }: { productId: string | null }) {
  const { data, report } = useApp();
  const dialogs = useDialogs();
  const id = productId && data.products.some((p) => p.id === productId) ? productId : report.products[0]?.product.id;
  const product = data.products.find((p) => p.id === id);
  const [kind, setKind] = useState<Kind>("all");
  const ledger = useMemo(() => (product ? stockLedger(data, product) : []), [data, product]);
  const rule = KINDS.find((k) => k.value === kind)!;
  const rows = ledger.filter((l) => kind === "all" || rule.match.includes(l.kind)).reverse();
  const row = report.products.find((r) => r.product.id === id);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Stock history"
        description="Every change to warehouse stock, newest first: what changed, when, why, and the stock after it."
        actions={
          <Button variant="outline" onClick={() => dialogs.stockChange(id)}>
            <ClipboardPenIcon /> Log sale or adjustment
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Select value={id} onValueChange={(v) => go(`history-${v}`)}>
          <SelectTrigger className="w-full sm:w-72" aria-label="Product">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="font-mono text-xs text-muted-foreground">{p.code}</span> {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {row && (
          <div className="text-sm text-muted-foreground">
            Now <span className="tnum font-semibold text-foreground">{units(row.stock)}</span> in the warehouse
          </div>
        )}
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {KINDS.map((k) => (
          <button
            key={k.value}
            onClick={() => setKind(k.value)}
            aria-pressed={kind === k.value}
            className={cn(
              "h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              kind === k.value ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      <section className="min-w-0 overflow-hidden rounded-xl border surface">
        <div className="hidden grid-cols-[7.5rem_1fr_6rem_6rem] gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
          <span>When</span>
          <span>What and why</span>
          <span className="text-right">Change</span>
          <span className="text-right">Stock after</span>
        </div>
        {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing of this kind yet.</p>}
        <ul className="divide-y">
          {rows.map((l) => (
            <li key={l.key} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[7.5rem_1fr_6rem_6rem]">
              <div className="tnum text-xs text-muted-foreground md:text-sm">{l.at && l.kind !== "shipped" ? formatMoment(l.at) : formatDay(l.date)}</div>
              <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto">
                <div className="text-sm font-medium">{LEDGER_LABEL[l.kind]}</div>
                <div className="text-xs break-words text-muted-foreground">
                  {l.kind !== "shipped" && l.why}
                  {l.actor && (
                    <>
                      {" "}
                      · <Who actor={l.actor} />
                    </>
                  )}
                </div>
              </div>
              <div
                className={cn(
                  "tnum row-start-1 text-right text-sm font-semibold md:row-start-auto",
                  l.change > 0 ? "text-st-ok" : l.change < 0 ? "" : "text-muted-foreground",
                )}
              >
                {l.change > 0 ? "+" : ""}
                {l.change === 0 ? "±0" : units(l.change)}
              </div>
              <div className="tnum hidden text-right text-sm text-muted-foreground md:block">{units(l.balance)}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
