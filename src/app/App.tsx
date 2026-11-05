import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftRightIcon,
  BoxesIcon,
  ClipboardPenIcon,
  CloudIcon,
  HardDriveIcon,
  HistoryIcon,
  MailIcon,
  MenuIcon,
  PackageCheckIcon,
  PackagePlusIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Settings2Icon,
  TriangleAlertIcon,
  TruckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { syncFeed } from "@/data/feed";
import { ago, formatStoreClock, formatWeekday } from "@/domain/dates";
import { useApp } from "./context";
import { Count } from "./components/badges";
import { StockView } from "./views/StockView";
import { ProductView } from "./views/ProductView";
import { OrdersView } from "./views/OrdersView";
import { ArrivalsView } from "./views/ArrivalsView";
import { HistoryView } from "./views/HistoryView";
import { MessagesView } from "./views/MessagesView";
import { SetupView } from "./views/SetupView";
import { SupplierPortal } from "./views/SupplierPortal";
import { ScorecardView } from "./views/ScorecardView";
import { CommandPalette } from "./CommandPalette";
import { CoffeeBackdrop } from "./components/coffee";
import { useDialogs, type Dialogs } from "./dialogs/DialogProvider";

function useHash() {
  const read = () => window.location.hash.replace(/^#/, "");
  const [hash, setHash] = useState(read);
  useEffect(() => {
    const on = () => {
      setHash(read());
      if (!read().startsWith("order-")) window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

type Section = "stock" | "orders" | "arrivals" | "history" | "messages" | "setup";

function sectionOf(route: string): Section {
  if (route.startsWith("order") || route === "suppliers") return "orders";
  if (route.startsWith("arrivals")) return "arrivals";
  if (route.startsWith("history")) return "history";
  if (route === "messages") return "messages";
  if (route === "setup") return "setup";
  return "stock";
}

export function App() {
  const route = useHash();
  const { viewer } = useApp();
  const supplier = viewer.role === "supplier";
  const section = sectionOf(route);
  const [palette, setPalette] = useState(false);
  useShortcuts(!supplier, setPalette);

  let page: ReactNode;
  if (supplier) page = <SupplierPortal />;
  else if (route.startsWith("product-")) page = <ProductView id={route.slice(8)} />;
  else if (route === "suppliers") page = <ScorecardView />;
  else if (section === "orders") page = <OrdersView route={route} />;
  else if (section === "arrivals") page = <ArrivalsView />;
  else if (section === "history") page = <HistoryView productId={route.startsWith("history-") ? route.slice(8) : null} />;
  else if (section === "messages") page = <MessagesView />;
  else if (section === "setup") page = <SetupView />;
  else page = <StockView />;

  return (
    <div className="relative isolate min-h-full lg:grid lg:grid-cols-[15rem_1fr]">
      <CoffeeBackdrop />
      <Sidebar section={section} supplier={supplier} />
      <div className="flex min-w-0 flex-col">
        <MobileTopBar onSearch={supplier ? undefined : () => setPalette(true)} />
        <main className="mx-auto w-full max-w-[90rem] min-w-0 flex-1 pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))] pt-4 pb-28 sm:pt-6 lg:px-8 lg:pb-12">
          <div className="grid gap-4">
            <StaleBanner />
            <ModeNote />
            {page}
          </div>
        </main>
      </div>
      {!supplier && <BottomNav section={section} />}
      {!supplier && <CommandPalette open={palette} onOpenChange={setPalette} />}
    </div>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * Keyboard: Ctrl/Cmd+K or / opens search; N new order, A arrival, L log change.
 * Single keys are ignored while typing or while a dialog is open.
 */
function useShortcuts(enabled: boolean, setPalette: (f: (o: boolean) => boolean) => void) {
  const dialogs = useDialogs();
  const ref = useRef<Dialogs>(dialogs);
  ref.current = dialogs;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((o) => !o);
        return;
      }
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (document.querySelector("[role=dialog], [role=alertdialog], [role=menu]")) return;
      const k = e.key.toLowerCase();
      if (k === "/") setPalette(() => true);
      else if (k === "n") ref.current.newOrder();
      else if (k === "a") ref.current.arrival();
      else if (k === "l") ref.current.stockChange();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, setPalette]);
}

// ---------------------------------------------------------------- nav

function useNav() {
  const { report } = useApp();
  return [
    { id: "stock" as const, label: "Stock", href: "#stock", icon: BoxesIcon, count: report.counts.out + report.counts.reorder, alert: true },
    { id: "orders" as const, label: "Supplier orders", short: "Orders", href: "#orders", icon: TruckIcon, count: report.counts.chase, alert: true },
    { id: "arrivals" as const, label: "Arrivals", href: "#arrivals", icon: PackageCheckIcon, count: report.counts.unmatched, alert: false },
    { id: "history" as const, label: "Stock history", short: "History", href: "#history", icon: HistoryIcon, count: 0, alert: false },
    { id: "messages" as const, label: "Messages", href: "#messages", icon: MailIcon, count: 0, alert: false },
    { id: "setup" as const, label: "Setup", href: "#setup", icon: Settings2Icon, count: 0, alert: false },
  ];
}

function Brand() {
  const { data } = useApp();
  return (
    <a href="#stock" className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-background">
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path d="M3 18 9 9l4 5 3-4 5 8z" fill="currentColor" />
        </svg>
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-semibold">{data.settings.storeName}</span>
        <span className="block text-xs text-muted-foreground">Stock report</span>
      </span>
    </a>
  );
}

function Sidebar({ section, supplier }: { section: Section; supplier: boolean }) {
  const nav = useNav();
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-sidebar/75 backdrop-blur-xl lg:flex">
      <div className="px-4 pt-5 pb-4">
        <Brand />
      </div>
      <nav className="grid gap-0.5 px-2" aria-label="Main">
        {supplier ? (
          <span className="flex h-9 items-center gap-2.5 rounded-md bg-accent px-2.5 text-sm font-medium">
            <TruckIcon className="size-4" /> My orders
          </span>
        ) : (
          nav.map((n) => (
            <a
              key={n.id}
              href={n.href}
              aria-current={section === n.id ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                section === n.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              <n.icon className="size-4" />
              <span className="flex-1">{n.label}</span>
              <Count n={n.count} tone={n.alert ? "alert" : "muted"} />
            </a>
          ))
        )}
      </nav>
      <div className="mt-auto grid gap-3 border-t p-3">
        <SyncStatus />
        <RoleSwitcher />
      </div>
    </aside>
  );
}

function BottomNav({ section }: { section: Section }) {
  const nav = useNav();
  const dialogs = useDialogs();
  const [more, setMore] = useState(false);
  const [quick, setQuick] = useState(false);
  const byId = (id: Section) => nav.find((n) => n.id === id)!;
  const left = [byId("stock"), byId("orders")];
  const right = [byId("arrivals")];
  const extra = nav.filter((n) => !["stock", "orders", "arrivals"].includes(n.id));
  const tab = (n: (typeof nav)[number]) => (
    <a
      key={n.id}
      href={n.href}
      aria-current={section === n.id ? "page" : undefined}
      className={cn(
        "relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px]",
        section === n.id ? "font-medium text-foreground" : "text-muted-foreground",
      )}
    >
      <n.icon className="size-5" />
      {n.short ?? n.label}
      {n.count > 0 && (
        <span className="tnum absolute top-1 left-1/2 ml-2 rounded-full bg-st-out px-1 text-[10px] leading-4 font-semibold text-white dark:text-background">
          {n.count}
        </span>
      )}
    </a>
  );
  // Quick actions close their sheet first so the dialog gets focus.
  const quickAct = (f: () => void) => () => {
    setQuick(false);
    window.setTimeout(f, 120);
  };
  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/85 pr-[max(8px,env(safe-area-inset-right,0px))] pb-[env(safe-area-inset-bottom,0px)] pl-[max(8px,env(safe-area-inset-left,0px))] backdrop-blur lg:hidden"
      >
        {left.map(tab)}
        <div className="flex items-center justify-center">
          <button
            onClick={() => setQuick(true)}
            aria-label="New order, arrival or stock change"
            className="grid size-11 place-items-center rounded-full bg-foreground text-background shadow-md transition-transform active:scale-95 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <PlusIcon className="size-5" />
          </button>
        </div>
        {right.map(tab)}
        <button
          onClick={() => setMore(true)}
          className={cn(
            "flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px]",
            extra.some((n) => n.id === section) ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          <MenuIcon className="size-5" />
          More
        </button>
      </nav>
      <Sheet open={quick} onOpenChange={setQuick}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(16px,env(safe-area-inset-bottom,0px))]">
          <SheetHeader>
            <SheetTitle>Add</SheetTitle>
            <SheetDescription>Record what just happened.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-2 px-4">
            {[
              { label: "Record an arrival", hint: "A delivery just landed at the warehouse", icon: PackagePlusIcon, run: () => dialogs.arrival() },
              { label: "New supplier order", hint: "Order more from a supplier", icon: PlusIcon, run: () => dialogs.newOrder() },
              { label: "Log a sale or adjustment", hint: "Wholesale, damage, a recount", icon: ClipboardPenIcon, run: () => dialogs.stockChange() },
            ].map((a) => (
              <button
                key={a.label}
                onClick={quickAct(a.run)}
                className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left active:bg-accent"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                  <a.icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{a.label}</span>
                  <span className="block text-xs text-muted-foreground">{a.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(16px,env(safe-area-inset-bottom,0px))]">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
            <SheetDescription>History, messages, setup, data and who you're viewing as.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-3 px-4">
            <div className="grid gap-1">
              {extra.map((n) => (
                <a key={n.id} href={n.href} onClick={() => setMore(false)} className="flex h-11 items-center gap-3 rounded-md px-2 text-sm hover:bg-accent">
                  <n.icon className="size-4" /> {n.label}
                </a>
              ))}
            </div>
            <SyncStatus />
            <RoleSwitcher />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function MobileTopBar({ onSearch }: { onSearch?: () => void }) {
  const { now, report } = useApp();
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 flex h-14 items-center justify-between gap-3 border-b bg-background/80 pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))] backdrop-blur lg:static lg:h-12 lg:bg-transparent lg:px-8 lg:backdrop-blur-none">
      <div className="lg:hidden">
        <Brand />
      </div>
      {onSearch && (
        <button
          onClick={onSearch}
          className="hidden h-9 w-80 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none lg:flex"
        >
          <SearchIcon className="size-4" />
          <span className="flex-1 text-left">Search products, orders, actions</span>
          <kbd className="rounded border bg-muted px-1.5 font-mono text-[11px]">{isMac ? "⌘K" : "Ctrl K"}</kbd>
        </button>
      )}
      <div className="tnum ml-auto text-right text-xs text-muted-foreground" title="All day counts use store time, America/Denver">
        <span className="hidden sm:inline">{formatWeekday(report.today)} · </span>
        {formatStoreClock(now)}
        <span className="hidden sm:inline"> · Denver store time</span>
      </div>
      {onSearch && (
        <Button variant="ghost" size="icon" className="-mr-2 lg:hidden" aria-label="Search products, orders and actions" onClick={onSearch}>
          <SearchIcon />
        </Button>
      )}
    </header>
  );
}

// ---------------------------------------------------------------- status

function SyncStatus() {
  const { data, now, run, report } = useApp();
  const [busy, setBusy] = useState(false);
  const last = data.feed.salesSyncedAt;
  const stale = report.stale.sales || report.stale.stock;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
      <div className="min-w-0 text-xs">
        <div className={cn("font-medium", stale && "text-st-urgent")}>{stale ? "Data is out of date" : "Data is current"}</div>
        <div className="truncate text-muted-foreground">{last ? `Synced ${ago(last, now)}` : "Never synced"}</div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Sync sales and stock now"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await run((s, _a, n) => syncFeed(s, n), "Sales and stock synced", { undo: false });
          setBusy(false);
        }}
      >
        <RefreshCwIcon className={cn(busy && "animate-spin")} />
      </Button>
    </div>
  );
}

function RoleSwitcher() {
  const { viewer, setViewer, data, store } = useApp();
  const value = viewer.role === "supplier" ? `supplier:${viewer.supplierId}` : "staff";
  const label =
    viewer.role === "supplier" ? data.suppliers.find((s) => s.id === viewer.supplierId)?.name ?? "Supplier" : "Operations staff";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            {store.mode === "shared" ? <CloudIcon className="size-4" /> : <HardDriveIcon className="size-4" />}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[11px] text-muted-foreground">Viewing as</span>
            <span className="block truncate text-sm font-medium">{label}</span>
          </span>
          <ArrowLeftRightIcon className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Demo sign-in. Pick who you are; a real deployment would use accounts.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => {
            setViewer(v === "staff" ? { role: "staff", supplierId: null } : { role: "supplier", supplierId: v.slice(9) });
            window.location.hash = v === "staff" ? "stock" : "portal";
          }}
        >
          <DropdownMenuRadioItem value="staff">Operations staff</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Supplier portal</DropdownMenuLabel>
          {data.suppliers.map((s) => (
            <DropdownMenuRadioItem key={s.id} value={`supplier:${s.id}`}>
              {s.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StaleBanner() {
  const { report, data, run, now } = useApp();
  const { stale } = report;
  if (!stale.sales && !stale.stock) return null;
  const last = data.feed.salesSyncedAt;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-st-urgent/40 bg-st-urgent-bg px-4 py-3">
      <TriangleAlertIcon className="size-4 shrink-0 text-st-urgent" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{stale.sales && stale.stock ? "Sales and stock data are" : stale.sales ? "Sales data is" : "Stock data is"} out of date.</span>{" "}
        <span className="text-foreground/75">
          {last ? `Last synced ${ago(last, now)}.` : "Never synced."} Forecasts only use what's here, so recent days may be missing.
        </span>
      </p>
      <Button size="sm" onClick={() => run((s, _a, n) => syncFeed(s, n), "Sales and stock synced", { undo: false })}>
        <RefreshCwIcon /> Sync now
      </Button>
    </div>
  );
}

function ModeNote() {
  const { store, viewer } = useApp();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem("ridgeline-stock:mode-note") === store.sandboxReason;
    } catch {
      return false;
    }
  });
  if (store.mode !== "sandbox" || hidden || !store.sandboxReason) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 px-4 py-2.5 text-sm">
      <HardDriveIcon className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-muted-foreground">
        <span className="font-medium text-foreground">Private copy.</span> {store.sandboxReason} Every feature works
        {viewer.role === "staff" ? "; reset it any time in Setup → Data." : "."}
      </p>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem("ridgeline-stock:mode-note", store.sandboxReason ?? "");
          } catch {
            /* ignore */
          }
        }}
      >
        Got it
      </Button>
    </div>
  );
}
