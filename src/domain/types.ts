/**
 * Data model for the stock report.
 *
 * Everything the app knows is one `AppState`: a handful of small collections.
 * Numbers such as warehouse stock, burn rate or an order's stage are never
 * stored; they are derived from these records by the functions in
 * `src/domain`, so there is exactly one place each rule lives.
 */

/** A calendar day in store time (America/Denver), formatted YYYY-MM-DD. */
export type StoreDate = string;
/** A moment in time, ISO 8601 UTC. */
export type Timestamp = string;

export interface ForecastSettings {
  /** Days from placing an order to it arriving. */
  leadTimeDays: number;
  /** Extra buffer kept on top of lead time. */
  safetyDays: number;
  /** Days of stock a new order should cover once it lands. */
  targetDays: number;
}

export interface Settings {
  storeName: string;
  forecast: ForecastSettings;
  /** Stock or sales data older than this many hours shows a warning. */
  staleAfterHours: number;
  reorderEmails: { enabled: boolean; recipients: string[] };
}

/** One way a product shows up in sales data, e.g. a single or a bundle. */
export interface SalesIdentifier {
  sku: string;
  label: string;
  /** Units of this product that leave the shelf per sale ("buy 2 get 2" = 4). */
  unitsPerSale: number;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  identifiers: SalesIdentifier[];
  supplierId: string;
  /** Per-product overrides; anything missing falls back to the defaults. */
  forecast: Partial<ForecastSettings>;
  /** Physical count the stock ledger starts from (taken at the start of `date`). */
  stockCount: { units: number; date: StoreDate };
  /** Next number for readable order names (CODE-001). Never reused. */
  nextOrderSeq: number;
  /** What one unit costs from the supplier, in US dollars. Older data may not have it. */
  unitCost?: number;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  email: string;
}

export type Role = "staff" | "supplier";

export interface Actor {
  role: Role;
  /** Set when a supplier acted. */
  supplierId?: string;
  /** Platform user id when the app runs with shared data; never a name. */
  userId?: string | null;
}

export interface HistoryEntry {
  at: Timestamp;
  actor: Actor;
  /** Short verb phrase: "Placed order", "Added tracking". */
  action: string;
  detail?: string;
}

export type Carrier = "UPS" | "FedEx" | "USPS" | "DHL" | "Other";

export interface Tracking {
  id: string;
  number: string;
  carrier: Carrier;
  units: number;
  /** Day the supplier handed this shipment to the carrier. */
  shippedOn: StoreDate;
  addedAt: Timestamp;
}

export type ChaseKind = "confirm" | "tracking" | "whereabouts";

/** What a person decided about an order. Its stage is derived, not stored. */
export type OrderState = "open" | "cancelled" | "closed";

export interface SupplierOrder {
  id: string;
  /** Readable unique name, product code + number: GRD-004. */
  name: string;
  productId: string;
  supplierId: string;
  units: number;
  notes: string;
  orderedOn: StoreDate;
  /** Set when someone marks the order confirmed. Tracking or an arrival also count as confirmed. */
  confirmedOn: StoreDate | null;
  tracking: Tracking[];
  state: OrderState;
  /** Last time each follow-up was sent, so an alert repeats at most every 2 days. */
  chasedAt: Partial<Record<ChaseKind, Timestamp>>;
  createdAt: Timestamp;
  history: HistoryEntry[];
  /** Unit cost when the order was placed, so a later price change doesn't rewrite it. */
  unitCost?: number;
}

/** Part of an arrival assigned to an order, or to nothing (orderId null = "not from an order"). */
export interface Allocation {
  orderId: string | null;
  units: number;
}

export interface Arrival {
  id: string;
  /** Readable name: ARR-0012. */
  name: string;
  productId: string;
  units: number;
  receivedOn: StoreDate;
  note: string;
  /** Units not covered here are unmatched and need someone to deal with them. */
  allocations: Allocation[];
  createdAt: Timestamp;
  history: HistoryEntry[];
}

export type StockChangeKind = "manual_sale" | "adjustment";

/** A change someone typed in by hand. */
export interface StockChange {
  id: string;
  productId: string;
  kind: StockChangeKind;
  /** Signed: a sale is negative, an adjustment either way. */
  units: number;
  note: string;
  on: StoreDate;
  at: Timestamp;
  actor: Actor;
}

/** One store day, keyed by SKU, as the store and warehouse report it. */
export interface SalesDay {
  date: StoreDate;
  /** Sales placed that day per SKU. Units = sales x unitsPerSale. */
  sold: Record<string, number>;
  /** Sales the warehouse shipped that day per SKU (often from earlier days). */
  shipped: Record<string, number>;
}

export interface FeedStatus {
  salesSyncedAt: Timestamp | null;
  stockSyncedAt: Timestamp | null;
  /** Day the demo business was generated; the simulated store feed is shaped around it. */
  demoAnchor?: StoreDate;
}

export type MessageKind = "order" | "chase" | "reorder_alert" | "test";

/** Emails are only ever written here. Test mode: nothing is delivered. */
export interface OutboxMessage {
  id: string;
  at: Timestamp;
  kind: MessageKind;
  to: string[];
  subject: string;
  body: string;
  orderId?: string;
  /** Set when one message covers several orders (a batch to one supplier). */
  orderIds?: string[];
  actor: Actor;
}

export interface AppState {
  settings: Settings;
  feed: FeedStatus;
  products: Product[];
  suppliers: Supplier[];
  orders: SupplierOrder[];
  arrivals: Arrival[];
  stockChanges: StockChange[];
  sales: SalesDay[];
  outbox: OutboxMessage[];
}

/** Collections as they are stored: one document per record. */
export type CollectionName =
  | "products"
  | "suppliers"
  | "orders"
  | "arrivals"
  | "stockChanges"
  | "sales"
  | "outbox";

/** Single documents. */
export type ConfigDoc = "settings" | "feed";

/**
 * What a user action changes. Mutations return one of these instead of
 * writing anything, so the same logic works for shared and local storage.
 */
export interface ChangeSet {
  put: { collection: CollectionName; id: string; data: unknown }[];
  remove: { collection: CollectionName; id: string }[];
  config: { doc: ConfigDoc; data: unknown }[];
}
