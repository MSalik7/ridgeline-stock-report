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
 * Beans at three depths, like a shallow depth of field: far ones are small,
 * sharp and slow; near ones are big, very blurry and fall faster (parallax).
 * Negative delays spread them across the screen from the first frame.
 */
const FAR = { blur: 0.8, alpha: 0.5 };
const MID = { blur: 2.5, alpha: 0.62 };
const NEAR = { blur: 11, alpha: 0.55 };
const BEANS = [
  { x: 4, y: 18, size: 16, ...FAR, dur: 92, delay: -8, dx: "2vw", spin: "280deg" },
  { x: 13, y: 70, size: 28, ...MID, dur: 70, delay: -41, dx: "-3vw", spin: "-220deg" },
  { x: 21, y: 6, size: 72, ...NEAR, dur: 52, delay: -14, dx: "5vw", spin: "140deg" },
  { x: 29, y: 44, size: 14, ...FAR, dur: 88, delay: -60, dx: "2vw", spin: "-300deg" },
  { x: 37, y: 84, size: 26, ...MID, dur: 66, delay: -25, dx: "3vw", spin: "240deg" },
  { x: 45, y: 28, size: 18, ...FAR, dur: 95, delay: -33, dx: "-2vw", spin: "200deg" },
  { x: 52, y: 58, size: 84, ...NEAR, dur: 58, delay: -47, dx: "-6vw", spin: "-120deg" },
  { x: 60, y: 12, size: 30, ...MID, dur: 72, delay: -4, dx: "-3vw", spin: "260deg" },
  { x: 68, y: 74, size: 15, ...FAR, dur: 90, delay: -71, dx: "2vw", spin: "-260deg" },
  { x: 75, y: 36, size: 24, ...MID, dur: 68, delay: -52, dx: "4vw", spin: "-200deg" },
  { x: 82, y: 4, size: 64, ...NEAR, dur: 55, delay: -30, dx: "-4vw", spin: "160deg" },
  { x: 88, y: 52, size: 17, ...FAR, dur: 86, delay: -18, dx: "-2vw", spin: "300deg" },
  { x: 94, y: 22, size: 27, ...MID, dur: 74, delay: -63, dx: "-3vw", spin: "220deg" },
  { x: 8, y: 40, size: 22, ...MID, dur: 78, delay: -10, dx: "3vw", spin: "-240deg" },
];

/** Steam rising off the latte, plus a couple of stray wisps elsewhere. */
const CUP_STEAM = [
  { x: "-34%", dur: 8, delay: 0, dx: "-3vw" },
  { x: "-8%", dur: 9.5, delay: -3, dx: "2vw" },
  { x: "18%", dur: 8.5, delay: -6, dx: "-1vw" },
];
const STRAY_STEAM = [
  { x: "14%", dur: 11, delay: -4, dx: "3vw" },
  { x: "46%", dur: 12, delay: -8, dx: "-3vw" },
];

function Bean() {
  return (
    <svg viewBox="-12 -16 24 32" className="size-full">
      <ellipse rx="10.5" ry="14.5" fill="var(--bean)" />
      <ellipse rx="10.5" ry="14.5" fill="url(#coffee-bean-sheen)" />
      <path d="M0 -12.5 C 5.5 -6, -5.5 5, 0 12.5" fill="none" stroke="var(--bean-crease)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function Steam({ x, dur, delay, dx }: { x: string; dur: number; delay: number; dx: string }) {
  return (
    <svg className="steam" viewBox="0 0 90 260" style={{ "--x": x, "--dur": `${dur}s`, "--delay": `${delay}s`, "--dx": dx } as CSSProperties}>
      <path d="M45 255 C 15 210, 75 170, 45 125 S 20 45, 50 5" fill="none" stroke="var(--steam)" strokeWidth="16" strokeLinecap="round" />
    </svg>
  );
}

/** A latte seen from above: saucer, cup, handle and a heart in the foam. */
function LatteCup() {
  return (
    <svg viewBox="-120 -120 240 240" className="size-full overflow-visible">
      <circle cx="10" cy="14" r="108" fill="var(--cup-shadow)" />
      <circle r="106" fill="var(--cup-saucer)" />
      <circle r="86" fill="none" stroke="var(--cup-shadow)" strokeWidth="3" />
      <circle cx="7" cy="9" r="72" fill="var(--cup-shadow)" />
      <rect x="62" y="-13" width="40" height="26" rx="13" fill="var(--cup-ceramic)" transform="rotate(32)" />
      <circle r="72" fill="var(--cup-ceramic)" />
      <circle r="61" fill="url(#coffee-latte)" />
      <circle r="58" fill="none" stroke="var(--cup-foam)" strokeOpacity="0.35" strokeWidth="3" />
      <g fill="var(--cup-foam)">
        <path d="M-40 6 C -42 40, 42 40, 40 6 C 30 26, -30 26, -40 6 Z" opacity="0.85" />
        <path d="M0 28 C -26 10, -33 -10, -21 -21 C -12 -28, -3 -24, 0 -15 C 3 -24, 12 -28, 21 -21 C 33 -10, 26 10, 0 28 Z" />
      </g>
      <path d="M0 -36 L0 40" stroke="var(--cup-foam)" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

/** An espresso from above: dark coffee with a caramel crema ring. */
function EspressoCup() {
  return (
    <svg viewBox="-120 -120 240 240" className="size-full overflow-visible">
      <circle cx="10" cy="14" r="96" fill="var(--cup-shadow)" />
      <circle r="94" fill="var(--cup-saucer)" />
      <circle cx="6" cy="8" r="62" fill="var(--cup-shadow)" />
      <rect x="52" y="-11" width="34" height="22" rx="11" fill="var(--cup-ceramic)" transform="rotate(-140)" />
      <circle r="62" fill="var(--cup-ceramic)" />
      <circle r="51" fill="url(#coffee-espresso)" />
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
      <svg width="0" height="0" className="absolute">
        <defs>
          <radialGradient id="coffee-bean-sheen" cx="0.32" cy="0.26" r="0.75">
            <stop offset="0" stopColor="white" stopOpacity="0.32" />
            <stop offset="0.55" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="coffee-latte" cx="0.45" cy="0.4" r="0.65">
            <stop offset="0" style={{ stopColor: "var(--cup-coffee)" }} />
            <stop offset="0.75" style={{ stopColor: "var(--cup-coffee)" }} />
            <stop offset="1" style={{ stopColor: "var(--cup-coffee-edge)" }} />
          </radialGradient>
          <radialGradient id="coffee-espresso" cx="0.45" cy="0.42" r="0.6">
            <stop offset="0" style={{ stopColor: "var(--cup-crema)" }} />
            <stop offset="0.45" style={{ stopColor: "var(--cup-coffee-edge)" }} />
            <stop offset="0.9" style={{ stopColor: "var(--cup-crema)" }} />
            <stop offset="1" style={{ stopColor: "var(--cup-coffee-edge)" }} />
          </radialGradient>
        </defs>
      </svg>
      <div className="brew brew-caramel" />
      <div className="brew brew-espresso" />
      <div className="brew brew-crema" />
      <div className="brew brew-mocha" />
      <div className="cup cup-espresso">
        <EspressoCup />
      </div>
      <div className="cup cup-latte">
        <LatteCup />
        {CUP_STEAM.map((s, i) => (
          <Steam key={i} {...s} />
        ))}
      </div>
      {STRAY_STEAM.map((s, i) => (
        <Steam key={i} {...s} />
      ))}
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
      <div className="coffee-grain" />
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
