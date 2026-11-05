import { useMemo, useState } from "react";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ClockIcon,
  MailIcon,
  PackagePlusIcon,
  PackageSearchIcon,
  TrendingDownIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { doneToday, todayActions, type TodayAction } from "@/domain/actions";
import { formatDay, formatMoment } from "@/domain/dates";
import { CHASE_LABEL } from "@/domain/orders";
import { useApp } from "../context";
import { useDialogs } from "../dialogs/DialogProvider";
import { Who, go } from "../components/bits";
import { SteamingCup } from "../components/coffee";
import { units } from "../format";

const ICON = {
  reorder: PackagePlusIcon,
  chase: MailIcon,
  match: PackageSearchIcon,
  gap: TrendingDownIcon,
} as const;

const TONE = {
  critical: "bg-st-out-bg text-st-out",
  high: "bg-st-reorder-bg text-st-reorder",
  normal: "bg-muted text-muted-foreground",
} as const;

/** The day's work, ranked, each item with the one button that resolves it. */
export function TodayPanel({ onChaseAll }: { onChaseAll: () => void }) {
  const { report, data } = useApp();
  const actions = useMemo(() => todayActions(report), [report]);
  const done = useMemo(() => doneToday(data, report.today), [data, report.today]);
  const chases = actions.filter((a) => a.kind === "chase").length;

  return (
    <section aria-labelledby="today-title" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 rounded-xl border surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 id="today-title" className="text-sm font-semibold">
            To do today{" "}
            <span className="font-normal text-muted-foreground">
              · {actions.length ? `${actions.length} item${actions.length === 1 ? "" : "s"}, most urgent first` : "all clear"}
            </span>
          </h2>
          {chases > 1 && (
            <Button variant="ghost" size="sm" onClick={onChaseAll}>
              <MailIcon /> Follow up on all {chases}
            </Button>
          )}
        </div>
        {actions.length === 0 ? (
          <div className="flex items-center gap-4 px-4 py-6 text-sm">
            <SteamingCup className="size-12 shrink-0 text-foreground/70" />
            <div>
              <div className="font-medium">Nothing needs you right now.</div>
              <div className="text-muted-foreground">
                Every product is above its reorder line and no supplier order needs chasing. Good moment for a coffee.
              </div>
            </div>
          </div>
        ) : (
          <ol className="divide-y">
            {actions.map((a) => (
              <ActionRow key={a.key} a={a} />
            ))}
          </ol>
        )}
      </div>

      <div className="grid content-start gap-4">
        <Waiting />
        <Done items={done} />
      </div>
    </section>
  );
}

function ActionRow({ a }: { a: TodayAction }) {
  const dialogs = useDialogs();
  const Icon = ICON[a.kind];
  const open = () => {
    if (a.kind === "reorder") dialogs.newOrder({ productId: a.productId, units: a.units || undefined });
    else if (a.kind === "chase") dialogs.chase(a.orderId, a.chase);
    else if (a.kind === "match") dialogs.match(a.arrivalId);
    else go(`product-${a.productId}`);
  };
  const label =
    a.kind === "reorder"
      ? `Order ${units(a.units)}`
      : a.kind === "chase"
        ? CHASE_LABEL[a.chase]
        : a.kind === "match"
          ? "Match units"
          : "See outlook";
  const href =
    a.kind === "chase" ? `#order-${a.orderId}` : a.kind === "match" ? "#arrivals" : `#product-${a.productId}`;
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 gap-3">
        <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", TONE[a.severity])}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <a href={href} className="text-sm font-medium hover:underline">
            {a.title}
          </a>
          {a.severity === "critical" && <span className="ml-2 align-middle text-[11px] font-medium text-st-out">Urgent</span>}
          <p className="mt-0.5 text-sm text-muted-foreground">{a.detail}</p>
        </div>
      </div>
      <Button size="sm" variant={a.severity === "critical" ? "default" : "outline"} className="ml-11 self-start sm:ml-0 sm:self-center" onClick={open}>
        {label}
      </Button>
    </li>
  );
}

function Waiting() {
  const { report } = useApp();
  if (!report.chaseWaiting.length) return null;
  return (
    <div className="rounded-xl border surface">
      <h3 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
        <ClockIcon className="size-4 text-muted-foreground" /> Waiting on suppliers
      </h3>
      <ul className="divide-y">
        {report.chaseWaiting.map((a) => {
          const o = report.orderById.get(a.orderId);
          return (
            <li key={`${a.orderId}-${a.kind}`} className="px-4 py-2.5 text-sm">
              <a href={`#order-${a.orderId}`} className="font-mono font-medium hover:underline">
                {o?.order.name}
              </a>{" "}
              <span className="text-muted-foreground">
                · {CHASE_LABEL[a.kind].toLowerCase()} sent. If there's still no answer, it comes back {a.nextDueOn ? formatDay(a.nextDueOn) : "soon"}.
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Done({ items }: { items: ReturnType<typeof doneToday> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border surface">
      <button
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={!items.length}
      >
        <span className="flex items-center gap-2">
          <CheckCircle2Icon className={cn("size-4", items.length ? "text-st-ok" : "text-muted-foreground")} />
          Done today <span className="tnum font-normal text-muted-foreground">{items.length}</span>
        </span>
        {items.length > 0 && <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />}
      </button>
      {!items.length && <p className="-mt-1 px-4 pb-3 text-xs text-muted-foreground">Orders placed, follow-ups sent and arrivals recorded today show up here.</p>}
      {open && (
        <ul className="divide-y border-t">
          {items.map((d) => (
            <li key={d.key} className="px-4 py-2.5 text-sm">
              <a href={d.href} className="hover:underline">
                {d.text}
              </a>
              <div className="text-xs text-muted-foreground">
                <Who actor={d.actor} /> · {formatMoment(d.at).split(", ").pop()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
