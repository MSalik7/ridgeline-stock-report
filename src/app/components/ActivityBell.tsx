import { useEffect, useMemo, useRef, useState } from "react";
import {
  BellIcon,
  CheckCheckIcon,
  ClipboardPenIcon,
  HourglassIcon,
  MailIcon,
  PackageCheckIcon,
  PackagePlusIcon,
  TriangleAlertIcon,
  TruckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { FEED_DAYS, activityFeed, unread, type Activity, type ActivityKind } from "@/domain/activity";
import { ago } from "@/domain/dates";
import { useApp } from "../context";
import { Who } from "./bits";

const KEY = "ridgeline-stock:seen-at";

const ICON: Record<ActivityKind, typeof BellIcon> = {
  supplier: TruckIcon,
  order: PackagePlusIcon,
  followup: MailIcon,
  arrival: PackageCheckIcon,
  stock: ClipboardPenIcon,
  late: HourglassIcon,
  out: TriangleAlertIcon,
};
const TONE: Record<ActivityKind, string> = {
  supplier: "bg-st-ok-bg text-st-ok",
  arrival: "bg-st-ok-bg text-st-ok",
  order: "bg-muted text-muted-foreground",
  followup: "bg-muted text-muted-foreground",
  stock: "bg-muted text-muted-foreground",
  late: "bg-st-reorder-bg text-st-reorder",
  out: "bg-st-out-bg text-st-out",
};

/** When this device last looked. A first visit counts the past week as new. */
function readSeen(now: Date): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v) return v;
  } catch {
    /* ignore */
  }
  return new Date(now.getTime() - 7 * 86_400_000).toISOString();
}

/** Bell in the top bar: what changed that you didn't do yourself. */
/** Items drawn per page of the list: a busy fortnight can hold hundreds. */
const PAGE = 30;

export function ActivityBell() {
  const { data, report, actor, now } = useApp();
  const feed = useMemo(() => activityFeed(data, report, actor, now), [data, report, actor, now]);
  const [seenAt, setSeenAt] = useState(() => readSeen(now));
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const fresh = useMemo(() => unread(feed, seenAt), [feed, seenAt]);
  const freshKeys = useMemo(() => new Set(fresh.map((f) => f.key)), [fresh]);

  // Ring once when something new lands while the app is open.
  const [ring, setRing] = useState(false);
  const last = useRef(fresh.length);
  useEffect(() => {
    if (fresh.length > last.current) setRing(true);
    last.current = fresh.length;
  }, [fresh.length]);

  const markSeen = () => {
    const at = new Date().toISOString();
    setSeenAt(at);
    try {
      localStorage.setItem(KEY, at);
    } catch {
      /* ignore */
    }
  };

  const n = fresh.length;
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setLimit(PAGE);
        // Items stay marked new while the list is open, then count as seen.
        if (!o && n) markSeen();
      }}
    >
      <PopoverTrigger asChild>
        <Button data-tour="bell" variant="ghost" size="icon" className="relative rounded-full" aria-label={n ? `Activity, ${n} new` : "Activity"} title="Activity">
          <BellIcon className={cn(ring && "bell-ring")} onAnimationEnd={() => setRing(false)} />
          {n > 0 && (
            <span className="tnum badge-pop absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-st-out px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-background dark:text-background">
              {n > 9 ? "9+" : n}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(24rem,calc(100vw-24px))] gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Activity</div>
            <div className="text-xs text-muted-foreground">{n ? `${n} new since you last looked` : "Nothing new since you last looked"}</div>
          </div>
          {n > 0 && (
            <Button variant="ghost" size="sm" onClick={markSeen}>
              <CheckCheckIcon /> Mark read
            </Button>
          )}
        </div>
        {feed.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing happened in the last {FEED_DAYS} days.</p>
        ) : (
          <div className="max-h-[min(28rem,65dvh)] overflow-y-auto overscroll-contain">
            {[
              { label: "New", items: feed.filter((a) => freshKeys.has(a.key)).slice(0, limit) },
              { label: n ? "Earlier" : null, items: feed.filter((a) => !freshKeys.has(a.key)).slice(0, Math.max(0, limit - n)) },
            ]
              .filter((g) => g.items.length)
              .map((g) => (
                <section key={g.label ?? "all"} aria-label={g.label ?? "Recent"}>
                  {g.label && <h3 className="sticky top-0 z-10 border-b bg-popover/95 px-4 py-1.5 text-[11px] font-medium text-muted-foreground backdrop-blur">{g.label}</h3>}
                  <ol className="divide-y">
                    {g.items.map((a) => (
                      <Item key={a.key} a={a} isNew={freshKeys.has(a.key)} now={now} onPick={() => setOpen(false)} />
                    ))}
                  </ol>
                </section>
              ))}
            {feed.length > limit && (
              <div className="border-t px-4 py-2.5">
                <Button variant="outline" size="sm" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>
                  Show {Math.min(PAGE, feed.length - limit)} older
                </Button>
              </div>
            )}
          </div>
        )}
        <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          Last {FEED_DAYS} days. Every stock change is in{" "}
          <a href="#history" className="font-medium text-foreground hover:underline" onClick={() => setOpen(false)}>
            Stock history
          </a>
          .
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Item({ a, isNew, now, onPick }: { a: Activity; isNew: boolean; now: Date; onPick: () => void }) {
  const Icon = ICON[a.kind];
  return (
    <li>
      <a
        href={a.href}
        onClick={onPick}
        className={cn(
          "flex gap-3 px-4 py-3 transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none",
          isNew && "bg-st-out-bg/40",
        )}
      >
        <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", TONE[a.kind])}>
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="text-sm leading-snug font-medium">{a.title}</span>
            {isNew && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-st-out" aria-label="New" />}
          </span>
          {a.detail && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{a.detail}</span>}
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {a.actor ? (
              <>
                <Who actor={a.actor} /> ·{" "}
              </>
            ) : null}
            {ago(a.at, now)}
          </span>
        </span>
      </a>
    </li>
  );
}
