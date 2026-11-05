import { useEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

/**
 * Theme. The viewer can pick Light or Dark (top right, or Setup → Data);
 * with no pick, the host's data-theme or the OS setting decides. The pick
 * is saved on this device only.
 */

export type ThemeChoice = "light" | "dark" | "system";

const KEY = "ridgeline-stock:theme";
const root = () => document.documentElement;
const listeners = new Set<() => void>();

/** What the page host set before we touched it, so "Match device" can restore it. */
let hostTheme: string | null = typeof document !== "undefined" ? root().getAttribute("data-theme") : null;
let watcher: MutationObserver | null = null;

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(choice: ThemeChoice) {
  if (choice !== "system") root().setAttribute("data-theme", choice);
  else if (hostTheme === "light" || hostTheme === "dark") root().setAttribute("data-theme", hostTheme);
  else root().removeAttribute("data-theme");
  // Drop the records of our own change, so the watcher only sees the host's.
  watcher?.takeRecords();
}

/** Call once before the first render, so the saved pick paints on frame one. */
export function initTheme() {
  // The host may set data-theme later. Remember it, but keep the viewer's own pick.
  watcher = new MutationObserver(() => {
    hostTheme = root().getAttribute("data-theme");
    const choice = readChoice();
    if (choice !== "system" && hostTheme !== choice) apply(choice);
  });
  watcher.observe(root(), { attributes: true, attributeFilter: ["data-theme"] });
  apply(readChoice());
}

function read(): "light" | "dark" {
  const attr = root().getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useColorScheme() {
  const [scheme, setScheme] = useState(read);
  useEffect(() => {
    const update = () => setScheme(read());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    const mo = new MutationObserver(update);
    mo.observe(root(), { attributes: true, attributeFilter: ["data-theme"] });
    listeners.add(update);
    return () => {
      mq.removeEventListener("change", update);
      mo.disconnect();
      listeners.delete(update);
    };
  }, []);
  return scheme;
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readChoice,
  );
}

/**
 * Save and apply a pick. From a click, the new theme spreads out from the
 * pointer as a circle; with reduced motion it just switches.
 */
export function setTheme(choice: ThemeChoice, from?: { x: number; y: number }) {
  const change = () => {
    try {
      if (choice === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {
      /* ignore: the pick lasts until reload */
    }
    apply(choice);
    flushSync(() => listeners.forEach((l) => l()));
  };

  const target =
    choice !== "system"
      ? choice
      : hostTheme === "light" || hostTheme === "dark"
        ? hostTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void>; skipTransition: () => void };
  };
  if (!doc.startViewTransition || reduced || document.hidden || target === read()) return change();

  // The transition waits for a frame. If none comes soon (a hidden or frozen
  // page), switch without the animation rather than leave the click hanging.
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    change();
  };
  const x = from?.x ?? window.innerWidth - 40;
  const y = from?.y ?? 28;
  const transition = doc.startViewTransition(once);
  window.setTimeout(() => {
    if (done) return;
    transition.skipTransition();
    once();
  }, 250);
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  transition.ready
    .then(() =>
      root().animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 560, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
      ),
    )
    .catch(() => {});
}
