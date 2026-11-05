import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ preference

const PREF_KEY = "ridgeline-stock:coffee-motion";
const listeners = new Set<() => void>();

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Whether the coffee backdrop moves, per device. The still version always shows. */
export function useCoffeeMotion(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readPref,
  );
  const set = (v: boolean) => {
    try {
      localStorage.setItem(PREF_KEY, v ? "on" : "off");
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  };
  return [on, set];
}

// ------------------------------------------------------------------ backdrop

/**
 * Beans: bigger ones sit "closer to the lens", so they're blurrier and
 * fainter, like a shallow depth of field. Negative delays spread them
 * across the screen from the first frame.
 */
const BEANS = [
  { x: 6, y: 12, size: 54, blur: 9, alpha: 0.5, dur: 78, delay: -12, dx: "4vw", spin: "160deg" },
  { x: 18, y: 64, size: 22, blur: 2, alpha: 0.7, dur: 64, delay: -40, dx: "-3vw", spin: "-220deg" },
  { x: 31, y: 30, size: 16, blur: 1.5, alpha: 0.6, dur: 70, delay: -5, dx: "2vw", spin: "300deg" },
  { x: 47, y: 78, size: 40, blur: 6, alpha: 0.45, dur: 86, delay: -55, dx: "-5vw", spin: "-140deg" },
  { x: 58, y: 8, size: 20, blur: 2, alpha: 0.65, dur: 60, delay: -22, dx: "3vw", spin: "240deg" },
  { x: 71, y: 46, size: 64, blur: 12, alpha: 0.4, dur: 92, delay: -70, dx: "-4vw", spin: "120deg" },
  { x: 84, y: 22, size: 26, blur: 3, alpha: 0.6, dur: 68, delay: -33, dx: "-2vw", spin: "-260deg" },
  { x: 93, y: 70, size: 18, blur: 1.5, alpha: 0.55, dur: 74, delay: -48, dx: "2vw", spin: "200deg" },
];

const STEAM = [
  { x: "12%", dur: 9, delay: 0, dx: "2vw" },
  { x: "38%", dur: 11, delay: -4, dx: "-3vw" },
  { x: "66%", dur: 10, delay: -7, dx: "3vw" },
  { x: "88%", dur: 12, delay: -2, dx: "-2vw" },
];

function Bean() {
  return (
    <svg viewBox="-12 -16 24 32" className="size-full">
      <ellipse rx="10.5" ry="14.5" fill="var(--bean)" />
      <path d="M0 -12.5 C 5.5 -6, -5.5 5, 0 12.5" fill="none" stroke="var(--bean-crease)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Blurry café scene behind the whole app. Decorative only. */
export function CoffeeBackdrop() {
  const [motion] = useCoffeeMotion();
  const [hidden, setHidden] = useState(() => (typeof document !== "undefined" ? document.hidden : false));
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  return (
    <div aria-hidden className={cn("coffee-backdrop", hidden && "is-paused", !motion && "is-still")}>
      <div className="brew brew-caramel" />
      <div className="brew brew-espresso" />
      <div className="brew brew-crema" />
      {BEANS.map((b, i) => (
        <div
          key={i}
          className="bean"
          style={
            {
              "--x": `${b.x}%`,
              "--y": `${b.y}vh`,
              "--size": `${b.size}px`,
              "--blur": `${b.blur}px`,
              "--alpha": b.alpha,
              "--dur": `${b.dur}s`,
              "--delay": `${b.delay}s`,
              "--dx": b.dx,
              "--spin": b.spin,
            } as CSSProperties
          }
        >
          <Bean />
        </div>
      ))}
      {STEAM.map((s, i) => (
        <svg
          key={i}
          className="steam"
          viewBox="0 0 90 260"
          style={{ "--x": s.x, "--dur": `${s.dur}s`, "--delay": `${s.delay}s`, "--dx": s.dx } as CSSProperties}
        >
          <path d="M45 255 C 15 210, 75 170, 45 125 S 20 45, 50 5" fill="none" stroke="var(--steam)" strokeWidth="16" strokeLinecap="round" />
        </svg>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ cups

/** Loading: a cup filling up. */
export function FillingCup({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-10", className)} aria-hidden>
      <defs>
        <clipPath id="cup-inside">
          <path d="M9 17h24v12a10 10 0 0 1-10 10h-4A10 10 0 0 1 9 29z" />
        </clipPath>
      </defs>
      <g className="text-muted-foreground" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
        <path className="cup-steam" d="M17 11c-1.5-2 1.5-3 0-5" />
        <path className="cup-steam" d="M22 11c-1.5-2 1.5-3 0-5" />
        <path className="cup-steam" d="M27 11c-1.5-2 1.5-3 0-5" />
      </g>
      <g clipPath="url(#cup-inside)">
        <rect className="cup-fill" x="8" y="17" width="26" height="23" fill="var(--bean)" />
      </g>
      <path d="M9 17h24v12a10 10 0 0 1-10 10h-4A10 10 0 0 1 9 29z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M33 21h3a4 4 0 0 1 0 8h-3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** All clear: a full cup, still steaming. */
export function SteamingCup({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-10", className)} aria-hidden>
      <g stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" className="text-muted-foreground">
        <path className="cup-steam" d="M17 13c-1.5-2 1.5-3 0-5" />
        <path className="cup-steam" d="M22 13c-1.5-2 1.5-3 0-5" />
        <path className="cup-steam" d="M27 13c-1.5-2 1.5-3 0-5" />
      </g>
      <path d="M9 19h24v10a10 10 0 0 1-10 10h-4A10 10 0 0 1 9 29z" fill="var(--bean)" stroke="currentColor" strokeWidth="2" />
      <path d="M33 22h3a4 4 0 0 1 0 8h-3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
