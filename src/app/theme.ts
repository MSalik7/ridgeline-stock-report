import { useEffect, useState } from "react";

/**
 * The viewer's theme. Claude sets data-theme on <html> for an explicit
 * choice; otherwise the OS setting decides.
 */
function read(): "light" | "dark" {
  const attr = document.documentElement.getAttribute("data-theme");
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
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", update);
      mo.disconnect();
    };
  }, []);
  return scheme;
}
