/**
 * Fake data for Ridgeline Coffee Supply, a small Denver coffee-gear shop.
 *
 * Everything is placed relative to the day it is generated, and shaped so
 * that each rule in the SOP has something to show: an out-of-stock product,
 * a reorder where the open orders aren't enough, low-urgent and low-watch
 * products, every order stage, a partial arrival, a closed and a cancelled
 * order, an arrival nobody ordered, and one alert of each chase kind.
 *
 * Before that recent story there are six months of ordinary history: each
 * product restocked on a steady cycle by the orders numbered before its
 * first recent one (KTL-001 to KTL-004, and so on), so stock charts show a
 * calm saw-tooth that only touches zero where the story says it should.
 */
import { addDays, storeDateOf } from "@/domain/dates";
import { orderMessage } from "@/domain/messages";
import { warehouseStock } from "@/domain/stock";
import { arrivalsByOrder, orderProgress } from "@/domain/orders";
import { chaseMessage } from "@/domain/messages";
import { DEFAULT_FORECAST } from "@/domain/forecast";
import type {
  Actor,
  Allocation,
  AppState,
  Arrival,
  HistoryEntry,
  OutboxMessage,
  Product,
  StockChange,
  Supplier,
  SupplierOrder,
  Tracking,
} from "@/domain/types";
import { simulatedSales, syncFeed } from "./feed";
import { applyChanges } from "./apply";

/** Six months of daily sales, so every chart range has real history behind it. */
const SALES_DAYS = 180;
const staff: Actor = { role: "staff" };
const sup = (supplierId: string): Actor => ({ role: "supplier", supplierId });

export const DEMO_SUPPLIERS: Supplier[] = [
  { id: "foshan", name: "Foshan Brightsteel Co.", contact: "Wei Chen", email: "brightsteel.orders@example.com" },
  { id: "taichung", name: "Taichung Precision Tools", contact: "Lin Yu-ting", email: "taichung.sales@example.com" },
  { id: "clayworks", name: "Jingdezhen Clayworks", contact: "Zhou Min", email: "clayworks.export@example.com" },
  { id: "kawa", name: "Kawa Paper Mills", contact: "Haruto Sato", email: "kawa.orders@example.com" },
];

/** What Ridgeline pays per unit, in US dollars. Orders keep the price they were placed at. */
export const DEMO_UNIT_COST: Record<string, number> = { ktl: 21.5, grd: 34, drp: 6.8, flt: 2.15, cbj: 9.4, mug: 7.9 };

/** Stock each product should have when the demo is generated. CBJ is meant to run out. */
const TARGET_STOCK: Record<string, number> = { ktl: 290, grd: 170, drp: 820, flt: 540, mug: 640 };

/** A made-up tracking number in the carrier's usual format, the same for the same seed. */
function fakeTracking(carrier: Tracking["carrier"], seed: string): string {
  let h = 2166136261;
  let digits = "";
  for (let i = 0; digits.length < 12; i++) {
    h ^= seed.charCodeAt(i % seed.length) + i;
    h = Math.imul(h, 16777619) >>> 0;
    digits += String(h % 10);
  }
  if (carrier === "UPS") return `1Z4F82W7${digits.slice(0, 10)}`;
  if (carrier === "DHL") return `44177${digits.slice(0, 5)}`;
  return `7729${digits.slice(0, 8)}`;
}

export function buildDemoState(now: Date): AppState {
  const today = storeDateOf(now);
  const d = (k: number) => addDays(today, k);
  /** Timestamp k days from today at an hour of the store day (approximate offset is fine for demo). */
  const t = (k: number, hour = 10) => `${d(k)}T${String(hour + 7).padStart(2, "0")}:${String((((k * 7 + 13) % 60) + 60) % 60).padStart(2, "0")}:00.000Z`;
  const start = d(-SALES_DAYS);

  const products: Product[] = [
    {
      id: "ktl",
      code: "KTL",
      name: "Gooseneck Kettle 1L",
      identifiers: [{ sku: "KTL-1L", label: "Single", unitsPerSale: 1 }],
      supplierId: "foshan",
      forecast: {},
      stockCount: { units: 0, date: start },
      nextOrderSeq: 9,
      unitCost: DEMO_UNIT_COST.ktl,
    },
    {
      id: "grd",
      code: "GRD",
      name: "Hand Burr Grinder",
      identifiers: [{ sku: "GRD-HB", label: "Single", unitsPerSale: 1 }],
      supplierId: "taichung",
      // Taiwan ships faster than the default.
      forecast: { leadTimeDays: 35 },
      stockCount: { units: 0, date: start },
      nextOrderSeq: 5,
      unitCost: DEMO_UNIT_COST.grd,
    },
    {
      id: "drp",
      code: "DRP",
      name: "Ceramic Dripper No. 2",
      identifiers: [{ sku: "DRP-02", label: "Single", unitsPerSale: 1 }],
      supplierId: "clayworks",
      forecast: {},
      stockCount: { units: 0, date: start },
      nextOrderSeq: 3,
      unitCost: DEMO_UNIT_COST.drp,
    },
    {
      id: "flt",
      code: "FLT",
      name: "Paper Filters, 100 ct",
      identifiers: [
        { sku: "FLT-100", label: "Single pack", unitsPerSale: 1 },
        { sku: "FLT-100-B2G2", label: "Buy 2 get 2", unitsPerSale: 4 },
      ],
      supplierId: "kawa",
      forecast: { safetyDays: 10 },
      stockCount: { units: 0, date: start },
      nextOrderSeq: 8,
      unitCost: DEMO_UNIT_COST.flt,
    },
    {
      id: "cbj",
      code: "CBJ",
      name: "Cold Brew Jar 1.5L",
      identifiers: [{ sku: "CBJ-15", label: "Single", unitsPerSale: 1 }],
      supplierId: "foshan",
      forecast: {},
      stockCount: { units: 0, date: start },
      nextOrderSeq: 4,
      unitCost: DEMO_UNIT_COST.cbj,
    },
    {
      id: "mug",
      code: "MUG",
      name: "Insulated Travel Mug 12oz",
      identifiers: [
        { sku: "MUG-12", label: "Single", unitsPerSale: 1 },
        { sku: "MUG-12-2PK", label: "2-pack", unitsPerSale: 2 },
      ],
      supplierId: "foshan",
      forecast: {},
      stockCount: { units: 0, date: start },
      nextOrderSeq: 6,
      unitCost: DEMO_UNIT_COST.mug,
    },
  ];

  const trk = (id: string, carrier: Tracking["carrier"], number: string, units: number, k: number): Tracking => ({
    id,
    carrier,
    number,
    units,
    shippedOn: d(k),
    addedAt: t(k, 15),
  });

  type O = Omit<SupplierOrder, "history" | "createdAt" | "chasedAt" | "notes" | "state"> &
    Partial<Pick<SupplierOrder, "chasedAt" | "notes" | "state">> & { k: number; extra?: HistoryEntry[] };
  const mk = (o: O): SupplierOrder => {
    const history: HistoryEntry[] = [
      { at: t(o.k, 9), actor: staff, action: "Placed order", detail: `${o.units} units` },
      { at: t(o.k, 9), actor: staff, action: "Sent order to supplier", detail: DEMO_SUPPLIERS.find((s) => s.id === o.supplierId)!.email },
    ];
    if (o.confirmedOn) history.push({ at: `${o.confirmedOn}T${"16"}:20:00.000Z`, actor: sup(o.supplierId), action: "Confirmed order", detail: "In production" });
    for (const tr of o.tracking) {
      history.push({ at: tr.addedAt, actor: sup(o.supplierId), action: "Added tracking", detail: `${tr.carrier} ${tr.number} · ${tr.units} units` });
    }
    history.push(...(o.extra ?? []));
    history.sort((a, b) => a.at.localeCompare(b.at));
    const { k, extra, ...rest } = o;
    void extra;
    return {
      notes: "",
      state: "open",
      chasedAt: {},
      unitCost: DEMO_UNIT_COST[o.productId],
      ...rest,
      createdAt: t(k, 9),
      history,
    };
  };

  const orders: SupplierOrder[] = [
    mk({ k: -88, id: "o-ktl5", name: "KTL-005", productId: "ktl", supplierId: "foshan", units: 200, orderedOn: d(-88), confirmedOn: d(-85), tracking: [trk("t1", "UPS", "1Z4F82W70398214470", 200, -55)] }),
    mk({ k: -80, id: "o-ktl6", name: "KTL-006", productId: "ktl", supplierId: "foshan", units: 350, orderedOn: d(-80), confirmedOn: d(-78), tracking: [trk("t2", "FedEx", "772914408815", 350, -55)] }),
    mk({ k: -40, id: "o-ktl7", name: "KTL-007", productId: "ktl", supplierId: "foshan", units: 300, orderedOn: d(-40), confirmedOn: d(-37), tracking: [trk("t3", "UPS", "1Z4F82W70399031285", 300, -5)], notes: "Matte black lids" }),
    mk({ k: -9, id: "o-ktl8", name: "KTL-008", productId: "ktl", supplierId: "foshan", units: 400, orderedOn: d(-9), confirmedOn: d(-6), tracking: [] }),

    mk({ k: -70, id: "o-grd3", name: "GRD-003", productId: "grd", supplierId: "taichung", units: 250, orderedOn: d(-70), confirmedOn: d(-68), tracking: [trk("t4", "DHL", "4417730251", 250, -33)], unitCost: 32.5 }),
    mk({ k: -1, id: "o-grd4", name: "GRD-004", productId: "grd", supplierId: "taichung", units: 300, orderedOn: d(-1), confirmedOn: null, tracking: [], notes: "Rush if possible: featured in a gift guide" }),

    mk({
      k: -80, id: "o-drp2", name: "DRP-002", productId: "drp", supplierId: "clayworks", units: 500, orderedOn: d(-80), confirmedOn: d(-77),
      tracking: [trk("t5", "DHL", "4417729904", 500, -50)], state: "closed",
      extra: [{ at: t(-35, 11), actor: staff, action: "Closed order", detail: "No more coming. 40 units will not arrive. 40 broke in transit; supplier issued a credit note." }],
    }),

    mk({ k: -88, id: "o-flt5", name: "FLT-005", productId: "flt", supplierId: "kawa", units: 1000, orderedOn: d(-88), confirmedOn: d(-85), tracking: [trk("t6", "FedEx", "772913377120", 1000, -55)] }),
    mk({ k: -50, id: "o-flt6", name: "FLT-006", productId: "flt", supplierId: "kawa", units: 1200, orderedOn: d(-50), confirmedOn: d(-47), tracking: [trk("t7", "UPS", "1Z9R3360A491177052", 700, -22), trk("t8", "UPS", "1Z9R3360A491180264", 500, -4)] }),
    mk({
      k: -16, id: "o-flt7", name: "FLT-007", productId: "flt", supplierId: "kawa", units: 1500, orderedOn: d(-16), confirmedOn: d(-12), tracking: [],
      chasedAt: { tracking: t(-1, 14) },
      extra: [{ at: t(-1, 14), actor: staff, action: "Sent follow-up: Ask for tracking", detail: "kawa.orders@example.com" }],
    }),

    mk({
      k: -45, id: "o-cbj3", name: "CBJ-003", productId: "cbj", supplierId: "foshan", units: 400, orderedOn: d(-45), confirmedOn: d(-40),
      tracking: [trk("t9", "FedEx", "772915021936", 400, -14)],
      chasedAt: { whereabouts: t(-3, 13) },
      extra: [{ at: t(-3, 13), actor: staff, action: "Sent follow-up: Ask where it is", detail: "brightsteel.orders@example.com" }],
    }),

    mk({ k: -62, id: "o-mug3", name: "MUG-003", productId: "mug", supplierId: "foshan", units: 600, orderedOn: d(-62), confirmedOn: d(-60), tracking: [trk("t10", "UPS", "1Z4F82W70397650912", 600, -35)] }),
    mk({
      k: -20, id: "o-mug4", name: "MUG-004", productId: "mug", supplierId: "foshan", units: 500, orderedOn: d(-20), confirmedOn: null, tracking: [], state: "cancelled", unitCost: 9.32,
      extra: [{ at: t(-18, 15), actor: staff, action: "Cancelled order", detail: "Supplier raised the unit price 18%. Re-quoting before reordering." }],
    }),
    mk({ k: -3, id: "o-mug5", name: "MUG-005", productId: "mug", supplierId: "foshan", units: 600, orderedOn: d(-3), confirmedOn: null, tracking: [], notes: "Same colorways as MUG-003" }),
  ];

  const arr = (id: string, name: string, productId: string, units: number, k: number, allocations: Allocation[], note = "", how = "matched automatically, oldest order first"): Arrival => ({
    id,
    name,
    productId,
    units,
    receivedOn: d(k),
    note,
    allocations,
    createdAt: t(k, 11),
    history: [
      {
        at: t(k, 11),
        actor: staff,
        action: "Recorded arrival",
        detail: `${units} units, ${how}.`,
      },
    ],
  });

  const arrivals: Arrival[] = [
    arr("a1", "ARR-0001", "drp", 460, -40, [{ orderId: "o-drp2", units: 460 }], "40 broken in transit, not received"),
    arr("a2", "ARR-0002", "flt", 1000, -45, [{ orderId: "o-flt5", units: 1000 }]),
    arr("a3", "ARR-0003", "mug", 600, -27, [{ orderId: "o-mug3", units: 600 }]),
    arr("a4", "ARR-0004", "grd", 250, -25, [{ orderId: "o-grd3", units: 250 }]),
    arr("a5", "ARR-0005", "ktl", 550, -45, [
      { orderId: "o-ktl5", units: 200 },
      { orderId: "o-ktl6", units: 350 },
    ], "Two orders consolidated in one container"),
    arr("a6", "ARR-0006", "flt", 700, -12, [{ orderId: "o-flt6", units: 700 }]),
    arr("a7", "ARR-0007", "drp", 24, -2, [], "Unexpected carton, no packing slip", "no open order to match"),
  ];

  const stockChanges: StockChange[] = [
    { id: "c1", productId: "drp", kind: "adjustment", units: -6, note: "Cracked in storage, written off", on: d(-12), at: t(-12, 15), actor: staff },
    { id: "c2", productId: "mug", kind: "manual_sale", units: -24, note: "Wholesale to a local cafe (demo customer)", on: d(-8), at: t(-8, 12), actor: staff },
    { id: "c3", productId: "ktl", kind: "adjustment", units: 3, note: "Cycle count: 3 found on the wrong shelf", on: d(-3), at: t(-3, 16), actor: staff },
  ];

  // ---------------------------------------------------------------- six months of restocks
  // Arrival days per product (days from today), the supplier's usual lead time,
  // its usual carrier, and the rounding step for order sizes.
  const HISTORY: Record<string, { arrivals: number[]; lead: number; carrier: Tracking["carrier"]; step: number }> = {
    ktl: { arrivals: [-168, -138, -108, -78], lead: 42, carrier: "UPS", step: 50 },
    grd: { arrivals: [-140, -80], lead: 45, carrier: "DHL", step: 50 },
    drp: { arrivals: [-120], lead: 40, carrier: "DHL", step: 50 },
    flt: { arrivals: [-165, -135, -105, -75], lead: 44, carrier: "FedEx", step: 100 },
    cbj: { arrivals: [-150, -100], lead: 42, carrier: "FedEx", step: 50 },
    mug: { arrivals: [-145, -85], lead: 42, carrier: "UPS", step: 50 },
  };
  const unitsOn = (p: Product, k: number) => p.identifiers.reduce((sum, id) => sum + simulatedSales(id.sku, d(k), today) * id.unitsPerSale, 0);
  const salesBetween = (p: Product, from: number, to: number) => {
    let sum = 0;
    for (let k = from; k <= to; k++) sum += unitsOn(p, k);
    return sum;
  };
  const windowStart = d(-45);
  const recentIn = (pid: string) =>
    arrivals.filter((a) => a.productId === pid && a.receivedOn >= windowStart).reduce((sum, a) => sum + a.units, 0) +
    stockChanges.filter((c) => c.productId === pid && c.on >= windowStart).reduce((sum, c) => sum + c.units, 0);
  const historicOrders: SupplierOrder[] = [];
  const historicArrivals: Arrival[] = [];
  for (const p of products) {
    const h = HISTORY[p.id];
    // Stock the recent story needs on hand as it starts. The jar is sized to run out 9 days ago.
    const needed = p.id === "cbj" ? salesBetween(p, -46, -10) : TARGET_STOCK[p.id] - recentIn(p.id) + salesBetween(p, -46, -1);
    const low = Math.max(h.step, Math.round((salesBetween(p, -SALES_DAYS, -46) / (SALES_DAYS - 45)) * 10 / h.step) * h.step);
    // Work backwards: each arrival tops stock up from about `low` (10 days of sales) by
    // what the next cycle sells, rounded to a supplier-friendly size.
    let before = needed;
    const sizes: number[] = [];
    for (let i = h.arrivals.length - 1; i >= 0; i--) {
      const until = i === h.arrivals.length - 1 ? -46 : h.arrivals[i + 1] - 1;
      const sold = salesBetween(p, h.arrivals[i], until);
      // Rounded so the dip before each delivery stays between `low` and one step above it.
      sizes[i] = Math.ceil((before - low - h.step + sold) / h.step) * h.step;
      before = before + sold - sizes[i];
    }
    h.arrivals.forEach((a, i) => {
      const seq = i + 1;
      const name = `${p.code}-${String(seq).padStart(3, "0")}`;
      const id = `o-${p.id}${seq}`;
      historicOrders.push(
        mk({
          k: a - h.lead, id, name, productId: p.id, supplierId: p.supplierId, units: sizes[i], orderedOn: d(a - h.lead),
          confirmedOn: d(a - h.lead + 2 + (seq % 2)), tracking: [trk(`th-${p.id}${seq}`, h.carrier, fakeTracking(h.carrier, name), sizes[i], a - 10)],
        }),
      );
      historicArrivals.push(arr(`ah-${p.id}${seq}`, "", p.id, sizes[i], a, [{ orderId: id, units: sizes[i] }]));
    });
  }
  // Arrival names follow the order they came in.
  const allArrivals = [...historicArrivals, ...arrivals].sort((x, y) => x.receivedOn.localeCompare(y.receivedOn) || x.id.localeCompare(y.id));
  allArrivals.forEach((a, i) => (a.name = `ARR-${String(i + 1).padStart(4, "0")}`));
  const allOrders = [...historicOrders, ...orders];

  const settings: AppState["settings"] = {
    storeName: "Ridgeline Coffee Supply",
    forecast: { ...DEFAULT_FORECAST },
    staleAfterHours: 24,
    reorderEmails: { enabled: true, recipients: ["ops@example.com", "owner@example.com"] },
  };

  const base: AppState = {
    settings,
    feed: { salesSyncedAt: null, stockSyncedAt: null, demoAnchor: today },
    products,
    suppliers: DEMO_SUPPLIERS,
    orders: allOrders,
    arrivals: allArrivals,
    stockChanges,
    sales: [],
    outbox: [],
  };

  // Pass 1: huge opening counts so nothing runs out, to learn how much each product ships.
  const BIG = 100_000;
  const probe: AppState = { ...base, products: products.map((p) => ({ ...p, stockCount: { ...p.stockCount, units: BIG } })) };
  const probed = applyChanges(probe, syncFeed(probe, now));

  // Pass 2: opening counts that land each product on its target today.
  const counts = new Map<string, number>();
  for (const p of probed.products) {
    if (p.id === "cbj") {
      // Enough to cover sales until 9 days ago, then it runs out.
      const cutoff = d(-9);
      const units = probed.sales
        .filter((s) => s.date < cutoff)
        .reduce((sum, s) => sum + (s.sold["CBJ-15"] ?? 0), 0);
      const delivered = historicArrivals.filter((a) => a.productId === "cbj").reduce((sum, a) => sum + a.units, 0);
      counts.set(p.id, Math.max(0, units - delivered));
    } else {
      counts.set(p.id, Math.max(0, TARGET_STOCK[p.id] - (warehouseStock(probed, p) - BIG)));
    }
  }
  const sized: AppState = {
    ...base,
    products: products.map((p) => ({ ...p, stockCount: { ...p.stockCount, units: counts.get(p.id)! } })),
  };
  const state = applyChanges(sized, syncFeed(sized, now));

  // Messages already sent, so the outbox has history.
  const arrived = arrivalsByOrder(state.arrivals);
  const msg = (id: string, at: string, kind: OutboxMessage["kind"], orderId: string, draft: { to: string[]; subject: string; body: string }): OutboxMessage => ({
    id, at, kind, orderId, actor: staff, ...draft,
  });
  const find = (id: string) => state.orders.find((o) => o.id === id)!;
  const prod = (id: string) => state.products.find((p) => p.id === id);
  const supp = (id: string) => state.suppliers.find((s) => s.id === id);
  const om = (id: string, k: number) => {
    const o = find(id);
    return msg(`m-${id}`, t(k, 9), "order", id, orderMessage(o, prod(o.productId), supp(o.supplierId), settings));
  };
  const flt7 = find("o-flt7");
  const cbj3 = find("o-cbj3");
  state.outbox = [
    om("o-flt7", -16),
    om("o-ktl8", -9),
    om("o-mug5", -3),
    om("o-grd4", -1),
    msg("m-cbj3-chase", t(-3, 13), "chase", "o-cbj3", chaseMessage("whereabouts", cbj3, orderProgress(cbj3, arrived.get(cbj3.id)), { reason: "Shipment 772915021936 on the way for 11 days" }, prod("cbj"), supp("foshan"), settings)),
    msg("m-flt7-chase", t(-1, 14), "chase", "o-flt7", chaseMessage("tracking", flt7, orderProgress(flt7, arrived.get(flt7.id)), { reason: "" }, prod("flt"), supp("kawa"), settings)),
  ];
  return state;
}
