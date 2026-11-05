import { cn } from "@/lib/utils";
import { STATUS_LABEL, type StockStatus } from "@/domain/forecast";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/domain/orders";

const STOCK_STYLE: Record<StockStatus, string> = {
  out: "bg-st-out text-white dark:text-background",
  reorder: "bg-st-reorder-bg text-st-reorder ring-1 ring-inset ring-st-reorder/30",
  urgent: "bg-st-urgent-bg text-st-urgent ring-1 ring-inset ring-st-urgent/30",
  watch: "bg-st-watch-bg text-st-watch",
  ok: "bg-st-ok-bg text-st-ok",
  no_sales: "bg-st-none-bg text-st-none",
};

export const STOCK_DOT: Record<StockStatus, string> = {
  out: "bg-st-out",
  reorder: "bg-st-reorder",
  urgent: "bg-st-urgent",
  watch: "bg-st-watch",
  ok: "bg-st-ok",
  no_sales: "bg-st-none",
};

export function StockBadge({ status, className }: { status: StockStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium whitespace-nowrap",
        STOCK_STYLE[status],
        className,
      )}
    >
      {status !== "out" && <span className={cn("size-1.5 rounded-full", STOCK_DOT[status])} />}
      {STATUS_LABEL[status]}
    </span>
  );
}

export const STAGE_COLOR: Record<OrderStatus, string> = {
  placed: "bg-sg-placed",
  in_production: "bg-sg-production",
  on_the_way: "bg-sg-transit",
  partial: "bg-sg-arrived",
  received: "bg-sg-arrived",
  closed: "bg-muted-foreground/50",
  cancelled: "bg-muted-foreground/30",
};

export function OrderBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const done = status === "closed" || status === "cancelled";
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap",
        done ? "border-dashed text-muted-foreground" : "bg-card",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", STAGE_COLOR[status])} />
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

/** Small count pill for nav items and section headers. */
export function Count({ n, tone = "muted" }: { n: number; tone?: "muted" | "alert" }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "tnum inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
        tone === "alert" ? "bg-st-out text-white dark:text-background" : "bg-muted text-muted-foreground",
      )}
    >
      {n}
    </span>
  );
}
