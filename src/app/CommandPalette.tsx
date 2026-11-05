import {
  BoxesIcon,
  ClipboardCopyIcon,
  ClipboardPenIcon,
  DownloadIcon,
  HistoryIcon,
  MailIcon,
  PackageCheckIcon,
  PackagePlusIcon,
  PlusIcon,
  RefreshCwIcon,
  Settings2Icon,
  TruckIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { syncFeed } from "@/data/feed";
import { STATUS_LABEL } from "@/domain/forecast";
import { ORDER_STATUS_LABEL } from "@/domain/orders";
import { unmatchedUnits } from "@/domain/arrivals";
import { useApp } from "./context";
import { useDialogs } from "./dialogs/DialogProvider";
import { STOCK_DOT, STAGE_COLOR } from "./components/badges";
import { go } from "./components/bits";
import { copyStockTable, downloadStockCsv } from "./export";
import { cn } from "@/lib/utils";

/** Jump to any product, order or page, or run an action, by typing. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { report, data, run } = useApp();
  const dialogs = useDialogs();
  const act = (f: () => void) => () => {
    onOpenChange(false);
    // Let the palette close before a dialog opens, so focus lands in the new dialog.
    window.setTimeout(f, 60);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Find a product, order or action">
      <CommandInput placeholder="Product, order code, or an action…" />
      <CommandList>
        <CommandEmpty>Nothing matches. Try a product code like GRD or an order like CBJ-003.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem value="new supplier order place" onSelect={act(() => dialogs.newOrder())}>
            <PlusIcon /> New supplier order <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem value="record warehouse arrival delivery" onSelect={act(() => dialogs.arrival())}>
            <PackagePlusIcon /> Record an arrival <CommandShortcut>A</CommandShortcut>
          </CommandItem>
          <CommandItem value="log manual sale adjustment stock change" onSelect={act(() => dialogs.stockChange())}>
            <ClipboardPenIcon /> Log a sale or adjustment <CommandShortcut>L</CommandShortcut>
          </CommandItem>
          {report.chaseDue.length > 0 && (
            <CommandItem value="follow up chase all suppliers" onSelect={act(() => dialogs.chaseAll())}>
              <MailIcon /> Follow up on all {report.chaseDue.length} due orders
            </CommandItem>
          )}
          <CommandItem value="sync sales stock refresh data" onSelect={act(() => void run((s, _a, n) => syncFeed(s, n), "Sales and stock synced", { undo: false }))}>
            <RefreshCwIcon /> Sync sales and stock
          </CommandItem>
          <CommandItem value="download export stock report csv" onSelect={act(() => void downloadStockCsv(report))}>
            <DownloadIcon /> Download stock report (CSV)
          </CommandItem>
          <CommandItem value="copy stock report table clipboard" onSelect={act(() => void copyStockTable(report))}>
            <ClipboardCopyIcon /> Copy stock report as a table
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Products">
          {report.products.map((r) => (
            <CommandItem
              key={r.product.id}
              value={`product ${r.product.code} ${r.product.name} ${r.product.identifiers.map((i) => i.sku).join(" ")}`}
              onSelect={act(() => go(`product-${r.product.id}`))}
            >
              <span className={cn("size-2 rounded-full", STOCK_DOT[r.forecast.status])} />
              <span className="w-10 font-mono text-xs text-muted-foreground">{r.product.code}</span>
              {r.product.name}
              <CommandShortcut className="tracking-normal">{STATUS_LABEL[r.forecast.status]}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Supplier orders">
          {report.orders.map((o) => (
            <CommandItem
              key={o.order.id}
              value={`order ${o.order.name} ${o.product?.name ?? ""} ${o.supplier?.name ?? ""} ${ORDER_STATUS_LABEL[o.status]}`}
              onSelect={act(() => go(`order-${o.order.id}`))}
            >
              <span className={cn("size-2 rounded-full", STAGE_COLOR[o.status])} />
              <span className="font-mono text-sm">{o.order.name}</span>
              <span className="truncate text-muted-foreground">{o.product?.name}</span>
              <CommandShortcut className="tracking-normal">{ORDER_STATUS_LABEL[o.status]}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Arrivals">
          {data.arrivals.map((a) => (
            <CommandItem
              key={a.id}
              value={`arrival ${a.name} ${data.products.find((p) => p.id === a.productId)?.name ?? ""}`}
              onSelect={act(() => dialogs.match(a.id))}
            >
              <PackageCheckIcon />
              <span className="font-mono text-sm">{a.name}</span>
              <span className="truncate text-muted-foreground">{data.products.find((p) => p.id === a.productId)?.name}</span>
              {unmatchedUnits(a) > 0 && <CommandShortcut className="tracking-normal text-st-urgent">{unmatchedUnits(a)} unmatched</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          {[
            { label: "Stock", href: "stock", icon: BoxesIcon },
            { label: "Supplier orders", href: "orders", icon: TruckIcon },
            { label: "Supplier scorecard", href: "suppliers", icon: TruckIcon },
            { label: "Arrivals", href: "arrivals", icon: PackageCheckIcon },
            { label: "Stock history", href: "history", icon: HistoryIcon },
            { label: "Messages", href: "messages", icon: MailIcon },
            { label: "Setup", href: "setup", icon: Settings2Icon },
          ].map((p) => (
            <CommandItem key={p.href} value={`go page ${p.label}`} onSelect={act(() => go(p.href))}>
              <p.icon /> {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
