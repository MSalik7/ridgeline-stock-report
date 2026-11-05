import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { placeTour, type Box, type Placement } from "../tourPlacement";

/**
 * A five-step guided tour of the main screens. It runs once on a first
 * visit to the stock page, can be skipped with Esc, and restarts from
 * Setup or search. Each step spotlights the real element on screen.
 */

const KEY = "ridgeline-stock:tour";
const listeners = new Set<() => void>();
let open = false;

function set(next: boolean) {
  open = next;
  listeners.forEach((l) => l());
}

/** Opens the tour on the stock page. */
export function startTour() {
  const onStock = ["", "stock"].includes(window.location.hash.replace(/^#/, ""));
  if (!onStock) window.location.hash = "stock";
  window.setTimeout(() => set(true), onStock ? 0 : 350);
}

function finish() {
  try {
    localStorage.setItem(KEY, "done");
  } catch {
    /* ignore */
  }
  set(false);
}

const wide = () => window.matchMedia("(min-width: 1024px)").matches;

interface Step {
  target: string;
  title: string;
  body: () => string;
}

const STEPS: Step[] = [
  {
    target: "today",
    title: "Start here",
    body: () => "To do today ranks what needs you, most urgent first. Each item has the one button that resolves it.",
  },
  {
    target: "plan",
    title: "Reorder in one go",
    body: () => "Plan reorders groups everything due by supplier, then drafts one message and one purchase order for each.",
  },
  {
    target: "products",
    title: "Every product, worst first",
    body: () => "Open a product to see its forecast worked out with real numbers, and to try an order before placing it.",
  },
  {
    target: "bell",
    title: "What changed",
    body: () => "The bell lists what suppliers did and what went late since you last looked.",
  },
  {
    target: "role",
    title: "The supplier's side",
    body: () =>
      `${wide() ? "Switch" : "Under More, switch"} who you're viewing as to see a supplier's portal: only their orders, to confirm and add tracking.`,
  },
];

/** The first visible element for a step. */
function find(target: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function Tour({ enabled }: { enabled: boolean }) {
  const isOpen = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );

  // First visit: start once the stock page has settled.
  useEffect(() => {
    if (!enabled) return;
    let seen: string | null = "done";
    try {
      seen = localStorage.getItem(KEY);
    } catch {
      /* private mode: don't nag */
    }
    if (seen || !["", "stock"].includes(window.location.hash.replace(/^#/, ""))) return;
    const t = window.setTimeout(() => set(true), 900);
    return () => window.clearTimeout(t);
  }, [enabled]);

  if (!isOpen || !enabled) return null;
  return createPortal(<Overlay />, document.body);
}

function Overlay() {
  const [steps] = useState(() => STEPS.filter((s) => find(s.target)));
  const [i, setI] = useState(0);
  const [place, setPlace] = useState<Placement | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  const measure = useCallback(() => {
    if (!step) return;
    const el = find(step.target);
    const r = el?.getBoundingClientRect();
    const box: Box | null = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
    const c = card.current?.getBoundingClientRect();
    setPlace(placeTour(box, { width: c?.width ?? 352, height: c?.height ?? 170 }, { width: window.innerWidth, height: window.innerHeight }));
  }, [step]);

  // Bring the target into view (only if it isn't already), then place everything.
  useLayoutEffect(() => {
    if (!step) return;
    const el = find(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.top < 64 || r.bottom > vh - 80) {
        const top = r.height > vh * 0.55 ? r.top + window.scrollY - 80 : r.top + window.scrollY - (vh - r.height) / 2;
        window.scrollTo({ top: Math.max(0, top) });
      }
    }
    measure();
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [step, measure]);

  // Focus "Next" once the card is placed (a hidden button can't take focus).
  const placed = !!place;
  useEffect(() => {
    if (!placed) return;
    next.current?.focus({ preventScroll: true });
    // On first open the page may still be settling; try once more.
    const t = window.setTimeout(() => next.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, [placed, i]);

  // Keep it in place on resize, scroll and when the card changes size.
  useEffect(() => {
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const ro = new ResizeObserver(measure);
    if (card.current) ro.observe(card.current);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      ro.disconnect();
    };
  }, [measure]);

  // The app behind is out of reach while the tour is open; leaving the page ends it.
  useEffect(() => {
    const root = document.getElementById("root");
    if (root) root.inert = true;
    document.body.dataset.tour = "open";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", finish);
    return () => {
      if (root) root.inert = false;
      delete document.body.dataset.tour;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", finish);
    };
  }, [steps.length]);

  useEffect(() => {
    if (!steps.length) finish();
  }, [steps.length]);
  if (!step) return null;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      {place?.spot ? (
        <div
          key="spot"
          aria-hidden
          className="tour-spot absolute rounded-xl"
          style={{ top: place.spot.top, left: place.spot.left, width: place.spot.width, height: place.spot.height }}
        />
      ) : (
        <div key="scrim" aria-hidden className="absolute inset-0 bg-[oklch(0.15_0.01_50/0.55)]" />
      )}
      <div
        ref={card}
        key={i}
        className={cn(
          "tour-card absolute w-[min(22rem,calc(100vw-32px))] rounded-xl border bg-popover p-4 text-popover-foreground shadow-xl",
          !place && "invisible",
        )}
        style={place ? { top: place.card.top, left: place.card.left } : undefined}
      >
        <h2 id="tour-title" className="text-sm font-semibold">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-1 text-sm text-muted-foreground">
          {step.body()}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" role="img" aria-label={`Step ${i + 1} of ${steps.length}`}>
            {steps.map((s, n) => (
              <span key={s.target} className={cn("h-1.5 rounded-full transition-all duration-300", n === i ? "w-4 bg-foreground" : "w-1.5 bg-muted-foreground/40")} />
            ))}
          </div>
          <div className="flex gap-2">
            {!last && (
              <Button variant="ghost" size="sm" onClick={finish}>
                Skip
              </Button>
            )}
            {i > 0 && (
              <Button variant="outline" size="sm" onClick={() => setI(i - 1)}>
                Back
              </Button>
            )}
            <Button ref={next} size="sm" onClick={() => (last ? finish() : setI(i + 1))}>
              {last ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
