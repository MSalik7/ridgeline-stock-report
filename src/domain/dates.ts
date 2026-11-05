import type { StoreDate, Timestamp } from "./types";

/** All day arithmetic happens in the store's own time zone. */
export const STORE_TIME_ZONE = "America/Denver";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hourFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: STORE_TIME_ZONE,
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/** The store calendar day a moment falls on. */
export function storeDateOf(at: Date | Timestamp): StoreDate {
  return dayFormatter.format(typeof at === "string" ? new Date(at) : at);
}

/** Hours since store midnight, e.g. 13.5 at 1:30 PM in Denver. */
export function storeHourOf(at: Date): number {
  const parts = hourFormatter.formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}

// Calendar math runs on UTC noon so daylight-saving shifts never move a day.
function toUtcNoon(d: StoreDate): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day, 12);
}

function fromUtc(ms: number): StoreDate {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

export function addDays(d: StoreDate, n: number): StoreDate {
  return fromUtc(toUtcNoon(d) + n * DAY_MS);
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: StoreDate, b: StoreDate): number {
  return Math.round((toUtcNoon(b) - toUtcNoon(a)) / DAY_MS);
}

/** Inclusive list of days from `from` to `to`. */
export function dayRange(from: StoreDate, to: StoreDate): StoreDate[] {
  const out: StoreDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const weekdayDate = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "Nov 5" */
export function formatDay(d: StoreDate): string {
  return shortDate.format(new Date(toUtcNoon(d)));
}

/** "Wed, Nov 5" */
export function formatWeekday(d: StoreDate): string {
  return weekdayDate.format(new Date(toUtcNoon(d)));
}

const timeInStore = new Intl.DateTimeFormat("en-US", {
  timeZone: STORE_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Nov 5, 9:14 AM" in store time. */
export function formatMoment(t: Timestamp): string {
  return timeInStore.format(new Date(t));
}

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: STORE_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/** "9:14 AM MST" */
export function formatStoreClock(at: Date): string {
  return clock.format(at);
}

/** "today", "yesterday", "in 3 days", "4 days ago" relative to a store day. */
export function relativeDay(d: StoreDate, today: StoreDate): string {
  const n = daysBetween(today, d);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** "3 h ago", "2 days ago" for timestamps. */
export function ago(t: Timestamp, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(t).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
