import { useSyncExternalStore } from "react";

/**
 * True while a CSS media query matches. Lists use it to build only the
 * layout on screen (table or cards) instead of both with one hidden,
 * which halves the work on big catalogues.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind's breakpoints, so a hook and a class agree on where the switch happens. */
export const MD = "(min-width: 48rem)";
export const XL = "(min-width: 80rem)";
