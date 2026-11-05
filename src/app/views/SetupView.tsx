import { useState } from "react";
import { PencilIcon, PlusIcon, RefreshCwIcon, SendIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCoffeeMotion } from "../components/coffee";
import { ThemeChoiceButtons } from "../components/ThemeToggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { syncFeed } from "@/data/feed";
import { ago, formatMoment } from "@/domain/dates";
import { effectiveSettings } from "@/domain/forecast";
import { reorderAlertMessage } from "@/domain/messages";
import { newId, outboxMessage, saveProduct, saveSettings, saveSupplier } from "@/domain/mutations";
import type { ForecastSettings, Product, SalesIdentifier, Supplier } from "@/domain/types";
import { useApp } from "../context";
import { loadDemoIntoShared, resetSandbox, switchToSandbox, switchToShared, hasShared } from "../store";
import { Confirm, Field, PageHeader, Panel, UnitsInput, toInt } from "../components/bits";
import { price } from "../format";
import { SupplierSelect } from "../dialogs/OrderDialogs";

const TABS = ["forecast", "products", "suppliers", "alerts", "data"] as const;

export function SetupView() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("forecast");
  return (
    <div className="grid gap-6">
      <PageHeader title="Setup" description="Products, suppliers, forecast settings, alert emails and data." />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="gap-4">
        <div className="-mx-4 overflow-x-auto overflow-y-hidden px-4 py-0.5 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
            <TabsTrigger value="alerts">Alert emails</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="forecast">
          <ForecastSetup />
        </TabsContent>
        <TabsContent value="products">
          <ProductsSetup />
        </TabsContent>
        <TabsContent value="suppliers">
          <SuppliersSetup />
        </TabsContent>
        <TabsContent value="alerts">
          <AlertsSetup />
        </TabsContent>
        <TabsContent value="data">
          <DataSetup />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------- forecast

function ForecastSetup() {
  const { data, run } = useApp();
  const f = data.settings.forecast;
  const [lead, setLead] = useState(String(f.leadTimeDays));
  const [safety, setSafety] = useState(String(f.safetyDays));
  const [target, setTarget] = useState(String(f.targetDays));
  const [stale, setStale] = useState(String(data.settings.staleAfterHours));
  return (
    <Panel title="Forecast defaults" description="Used for every product without its own settings. Change a product's own settings under Products.">
      <form
        className="grid max-w-2xl gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              saveSettings({
                ...data.settings,
                forecast: { leadTimeDays: toInt(lead), safetyDays: toInt(safety), targetDays: toInt(target) },
                staleAfterHours: toInt(stale),
              }),
            "Settings saved",
          );
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="fs-lead" label="Lead time (days)" hint="Order placed to units arrived.">
            <UnitsInput id="fs-lead" value={lead} onChange={setLead} />
          </Field>
          <Field id="fs-safety" label="Safety days" hint="Buffer on top of lead time.">
            <UnitsInput id="fs-safety" value={safety} onChange={setSafety} />
          </Field>
          <Field id="fs-target" label="Target days" hint="Stock a new order should cover once it lands.">
            <UnitsInput id="fs-target" value={target} onChange={setTarget} />
          </Field>
        </div>
        <p className="text-sm text-muted-foreground">
          Reorder line = lead time + safety = <span className="tnum font-medium text-foreground">{(toInt(lead) || 0) + (toInt(safety) || 0)} days</span>. A product
          whose stock plus open orders lasts fewer days is flagged “Reorder now”.
        </p>
        <Field id="fs-stale" label="Warn when data is older than (hours)" hint="Shows a warning when sales or stock data hasn't synced for this long." className="sm:max-w-56">
          <UnitsInput id="fs-stale" value={stale} onChange={setStale} />
        </Field>
        <div>
          <Button type="submit">Save defaults</Button>
        </div>
      </form>
    </Panel>
  );
}

// ---------------------------------------------------------------- products

function ProductsSetup() {
  const { data } = useApp();
  const [editing, setEditing] = useState<Product | null>(null);
  const blank = (): Product => ({
    id: newId(),
    code: "",
    name: "",
    identifiers: [{ sku: "", label: "Single", unitsPerSale: 1 }],
    supplierId: data.suppliers[0]?.id ?? "",
    forecast: {},
    stockCount: { units: 0, date: new Date().toISOString().slice(0, 10) },
    nextOrderSeq: 1,
  });
  return (
    <Panel
      title="Products"
      description="Sales identifiers match store sales to a product. A bundle identifier counts each sale as several units."
      action={
        <Button size="sm" onClick={() => setEditing(blank())}>
          <PlusIcon /> Add product
        </Button>
      }
      bodyClassName="p-0"
    >
      <ul className="divide-y">
        {data.products.map((p) => {
          const own = Object.entries(p.forecast).filter(([, v]) => v !== undefined);
          return (
            <li key={p.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  <span className="font-mono text-muted-foreground">{p.code}</span> {p.name}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {p.identifiers.map((i) => (
                    <span key={i.sku} className="inline-flex h-5 items-center rounded border px-1.5 font-mono text-[11px]">
                      {i.sku}
                      {i.unitsPerSale > 1 && <span className="ml-1 text-muted-foreground">×{i.unitsPerSale}</span>}
                    </span>
                  ))}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {data.suppliers.find((s) => s.id === p.supplierId)?.name ?? "No supplier"}
                  {p.unitCost !== undefined ? ` · ${price(p.unitCost)} per unit` : " · no unit cost"}
                  {own.length > 0 && ` · own settings: ${own.map(([k, v]) => `${LABEL[k as keyof ForecastSettings]} ${v} d`).join(", ")}`}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                <PencilIcon /> Edit
              </Button>
            </li>
          );
        })}
      </ul>
      {editing && <ProductDialog product={editing} isNew={!data.products.some((p) => p.id === editing.id)} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

const LABEL: Record<keyof ForecastSettings, string> = { leadTimeDays: "lead", safetyDays: "safety", targetDays: "target" };

function ProductDialog({ product, isNew, onClose }: { product: Product; isNew: boolean; onClose: () => void }) {
  const { data, report, run } = useApp();
  const [name, setName] = useState(product.name);
  const [code, setCode] = useState(product.code);
  const [supplierId, setSupplierId] = useState(product.supplierId);
  const [ids, setIds] = useState<(SalesIdentifier & { units: string })[]>(product.identifiers.map((i) => ({ ...i, units: String(i.unitsPerSale) })));
  const [own, setOwn] = useState<Record<keyof ForecastSettings, string>>({
    leadTimeDays: product.forecast.leadTimeDays?.toString() ?? "",
    safetyDays: product.forecast.safetyDays?.toString() ?? "",
    targetDays: product.forecast.targetDays?.toString() ?? "",
  });
  const [count, setCount] = useState(String(product.stockCount.units));
  const [cost, setCost] = useState(product.unitCost?.toString() ?? "");
  const eff = effectiveSettings(data.settings.forecast, product);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add a product" : `Edit ${product.name}`}</DialogTitle>
          <DialogDescription>The code starts every order name, like {code || "GRD"}-001.</DialogDescription>
        </DialogHeader>
        <form
          id="product-form"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const forecast: Partial<ForecastSettings> = {};
            for (const k of Object.keys(own) as (keyof ForecastSettings)[]) if (own[k].trim() !== "") forecast[k] = toInt(own[k]);
            const ok = await run(
              (s) =>
                saveProduct(s, {
                  ...product,
                  name,
                  code,
                  supplierId,
                  forecast,
                  identifiers: ids.map(({ sku, label, units }) => ({ sku, label, unitsPerSale: toInt(units) })),
                  unitCost: cost.trim() === "" ? undefined : Number(cost),
                  stockCount: isNew ? { units: toInt(count) || 0, date: report.today } : product.stockCount,
                }),
              isNew ? "Product added" : "Product saved",
            );
            if (ok) onClose();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field id="pd-name" label="Name">
              <Input id="pd-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field id="pd-code" label="Short code">
              <Input id="pd-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono" maxLength={8} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field id="pd-supplier" label="Usual supplier">
              <SupplierSelect id="pd-supplier" value={supplierId} onChange={setSupplierId} />
            </Field>
            <Field id="pd-cost" label="Unit cost (USD)">
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  id="pd-cost"
                  inputMode="decimal"
                  autoComplete="off"
                  className="tnum pl-6"
                  placeholder="0.00"
                  value={cost}
                  onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))}
                />
              </div>
            </Field>
          </div>
          <div className="grid gap-2">
            <div className="text-sm font-medium">Sales identifiers</div>
            {ids.map((i, n) => (
              <div key={n} className="grid grid-cols-[1fr_1fr_4.5rem_auto] items-center gap-2">
                <Input aria-label="SKU" placeholder="SKU" className="font-mono" value={i.sku} onChange={(e) => setIds(ids.map((x, j) => (j === n ? { ...x, sku: e.target.value.toUpperCase() } : x)))} />
                <Input aria-label="Label" placeholder="Label" value={i.label} onChange={(e) => setIds(ids.map((x, j) => (j === n ? { ...x, label: e.target.value } : x)))} />
                <UnitsInput id={`pd-units-${n}`} value={i.units} onChange={(v) => setIds(ids.map((x, j) => (j === n ? { ...x, units: v } : x)))} />
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove identifier" disabled={ids.length === 1} onClick={() => setIds(ids.filter((_, j) => j !== n))}>
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Last column: units per sale. “Buy 2 get 2” = 4.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setIds([...ids, { sku: "", label: "", unitsPerSale: 1, units: "1" }])}>
                <PlusIcon /> Identifier
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="text-sm font-medium">This product's forecast settings</div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(own) as (keyof ForecastSettings)[]).map((k) => (
                <Field key={k} id={`pd-${k}`} label={<span className="capitalize">{LABEL[k]}</span>}>
                  <UnitsInput id={`pd-${k}`} value={own[k]} onChange={(v) => setOwn({ ...own, [k]: v })} placeholder={`${data.settings.forecast[k]} (default)`} />
                </Field>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Leave blank to use the default. In use now: lead {eff.leadTimeDays}, safety {eff.safetyDays}, target {eff.targetDays} days.
            </p>
          </div>
          {isNew && (
            <Field id="pd-count" label="Units in the warehouse now" hint="Opening count. Stock history starts from here.">
              <UnitsInput id="pd-count" value={count} onChange={setCount} />
            </Field>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="product-form">
            {isNew ? "Add product" : "Save product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- suppliers

function SuppliersSetup() {
  const { data } = useApp();
  const [editing, setEditing] = useState<Supplier | null>(null);
  return (
    <Panel
      title="Suppliers"
      action={
        <Button size="sm" onClick={() => setEditing({ id: newId(), name: "", contact: "", email: "" })}>
          <PlusIcon /> Add supplier
        </Button>
      }
      bodyClassName="p-0"
    >
      <ul className="divide-y">
        {data.suppliers.map((s) => {
          const open = data.orders.filter((o) => o.supplierId === s.id && o.state === "open").length;
          return (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{s.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {s.contact} · <span className="select-all">{s.email}</span> · {open} open order{open === 1 ? "" : "s"}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                <PencilIcon /> Edit
              </Button>
            </li>
          );
        })}
      </ul>
      {editing && <SupplierDialog supplier={editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function SupplierDialog({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const { data, run } = useApp();
  const [s, setS] = useState(supplier);
  const isNew = !data.suppliers.some((x) => x.id === supplier.id);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add a supplier" : `Edit ${supplier.name}`}</DialogTitle>
          <DialogDescription>Order messages and follow-ups go to this email.</DialogDescription>
        </DialogHeader>
        <form
          id="supplier-form"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run((st) => saveSupplier(st, s), isNew ? "Supplier added" : "Supplier saved");
            if (ok) onClose();
          }}
        >
          <Field id="sp-name" label="Company">
            <Input id="sp-name" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
          </Field>
          <Field id="sp-contact" label="Contact person">
            <Input id="sp-contact" value={s.contact} onChange={(e) => setS({ ...s, contact: e.target.value })} />
          </Field>
          <Field id="sp-email" label="Email">
            <Input id="sp-email" type="email" value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} placeholder="orders@example.com" />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="supplier-form">
            Save supplier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- alerts

function AlertsSetup() {
  const { data, report, run } = useApp();
  const r = data.settings.reorderEmails;
  const [recipients, setRecipients] = useState(r.recipients.join(", "));
  const list = recipients.split(/[,;\s]+/).filter(Boolean);
  const due = report.products.filter((p) => p.forecast.flags.reorderNow || p.forecast.flags.outOfStock);
  const save = (enabled: boolean) =>
    run(() => saveSettings({ ...data.settings, reorderEmails: { enabled, recipients: list } }), enabled ? "Reorder emails on" : "Reorder emails off");
  return (
    <Panel title="Reorder alert emails" description="A daily email listing products below the reorder line. Email is in test mode: messages are logged under Messages and not delivered.">
      <div className="grid max-w-2xl gap-5">
        <label htmlFor="al-enabled" className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
          <span>
            <span className="block text-sm font-medium">Send reorder alerts</span>
            <span className="block text-xs text-muted-foreground">
              {r.enabled ? `On. Today's alert would list ${due.length} product${due.length === 1 ? "" : "s"}.` : "Off. Nobody gets reorder emails."}
            </span>
          </span>
          <Switch id="al-enabled" checked={r.enabled} onCheckedChange={(v) => void save(v)} />
        </label>
        <Field id="al-to" label="Who gets them" hint="Separate addresses with commas.">
          <Input id="al-to" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="ops@example.com, owner@example.com" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void save(r.enabled)}>
            Save recipients
          </Button>
          <Button
            variant="outline"
            disabled={!list.length}
            onClick={() =>
              run((s, a, now) => outboxMessage({ kind: "test", ...reorderAlertMessage(report.products, s.settings, true), to: list }, a, now), "Test logged in Messages (not delivered)")
            }
          >
            <SendIcon /> Send a test
          </Button>
          <Button
            disabled={!list.length || !r.enabled}
            onClick={() =>
              run((s, a, now) => outboxMessage({ kind: "reorder_alert", ...reorderAlertMessage(report.products, s.settings), to: list }, a, now), "Reorder alert logged in Messages")
            }
          >
            <SendIcon /> Send today's alert now
          </Button>
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- data

function DataSetup() {
  const { data, store, now, run } = useApp();
  const [motion, setMotion] = useCoffeeMotion();
  const [ask, setAsk] = useState<null | "reset" | "demo">(null);
  const feed = data.feed;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Store and warehouse feed" description="Sales come from the store, shipments and stock from the warehouse. This demo uses a simulated feed so every number stays real.">
        <dl className="grid gap-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Sales last synced</dt>
            <dd className="tnum">{feed.salesSyncedAt ? `${formatMoment(feed.salesSyncedAt)} (${ago(feed.salesSyncedAt, now)})` : "Never"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Stock last synced</dt>
            <dd className="tnum">{feed.stockSyncedAt ? `${formatMoment(feed.stockSyncedAt)} (${ago(feed.stockSyncedAt, now)})` : "Never"}</dd>
          </div>
        </dl>
        <Button className="mt-4" onClick={() => run((s, _a, n) => syncFeed(s, n), "Sales and stock synced", { undo: false })}>
          <RefreshCwIcon /> Sync now
        </Button>
      </Panel>
      <Panel
        title={store.mode === "shared" ? "Shared data" : "Private copy"}
        description={
          store.mode === "shared"
            ? "Everyone with edit access sees and changes the same data, live."
            : store.sandboxReason ?? "Changes are saved in this browser only."
        }
      >
        <div className="flex flex-wrap gap-2">
          {store.mode === "sandbox" && (
            <Button variant="outline" onClick={() => setAsk("reset")}>
              Start over with fresh demo data
            </Button>
          )}
          {store.mode === "sandbox" && hasShared() && (
            <Button variant="outline" onClick={() => { resetSandbox("shared"); toast.success("Copied the latest shared data"); }}>
              Copy the latest shared data
            </Button>
          )}
          {store.mode === "sandbox" && hasShared() && store.sandboxReason?.startsWith("You chose") && (
            <Button onClick={() => switchToShared()}>Back to shared data</Button>
          )}
          {store.mode === "shared" && (
            <Button variant="outline" onClick={() => switchToSandbox()}>
              Try things in a private copy
            </Button>
          )}
          {store.mode === "shared" && store.isOwner && (
            <Button variant="outline" onClick={() => setAsk("demo")}>
              Reset shared data to the demo
            </Button>
          )}
        </div>
      </Panel>
      <Panel title="Display" description="Saved on this device only." bodyClassName="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-medium">Theme</span>
            <span className="block text-xs text-muted-foreground">Also in the top right corner. Match device follows your system setting.</span>
          </span>
          <ThemeChoiceButtons />
        </div>
        <label htmlFor="coffee-motion" className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Moving coffee background</span>
            <span className="block text-xs text-muted-foreground">
              {motion ? "Beans drift and steam rises behind the app." : "The background stays still."} It also stays still when your device asks for reduced
              motion.
            </span>
          </span>
          <Switch id="coffee-motion" checked={motion} onCheckedChange={setMotion} />
        </label>
      </Panel>
      <Confirm
        open={ask === "reset"}
        onOpenChange={(o) => !o && setAsk(null)}
        title="Start over?"
        body="Your private copy is replaced with freshly generated demo data. Shared data is not touched."
        confirm="Start over"
        onConfirm={() => {
          resetSandbox("demo");
          toast.success("Fresh demo data loaded");
        }}
      />
      <Confirm
        open={ask === "demo"}
        onOpenChange={(o) => !o && setAsk(null)}
        title="Replace all shared data?"
        body="Every order, arrival and change everyone made is replaced with freshly generated demo data. This can't be undone."
        confirm="Replace shared data"
        destructive
        onConfirm={() => {
          const t = toast.loading("Writing demo data…");
          loadDemoIntoShared()
            .then(() => toast.success("Shared data reset to the demo", { id: t }))
            .catch((e: Error) => toast.error(e.message, { id: t }));
        }}
      />
    </div>
  );
}
