import type { MouseEvent } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { setTheme, useColorScheme, useThemeChoice, type ThemeChoice } from "../theme";

const centre = (e: MouseEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** Light / dark pill for the top bar. The thumb slides; the page wipes in from the button. */
export function ThemeToggle({ className }: { className?: string }) {
  const scheme = useColorScheme();
  return (
    <div role="group" aria-label="Color theme" className={cn("relative grid shrink-0 grid-cols-2 rounded-full border bg-card/70 p-0.5 shadow-xs backdrop-blur", className)}>
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-foreground shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          scheme === "dark" && "translate-x-full",
        )}
      />
      {(["light", "dark"] as const).map((t) => {
        const on = scheme === t;
        const Icon = t === "light" ? SunIcon : MoonIcon;
        return (
          <button
            key={t}
            type="button"
            aria-pressed={on}
            aria-label={t === "light" ? "Light mode" : "Dark mode"}
            title={t === "light" ? "Light mode" : "Dark mode"}
            onClick={(e) => !on && setTheme(t, centre(e))}
            className={cn(
              "relative grid size-7 place-items-center rounded-full transition-colors duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              on ? "text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("size-3.5 transition-transform duration-500", on && (t === "light" ? "rotate-90" : "-rotate-12"))} />
          </button>
        );
      })}
    </div>
  );
}

/** Setup → Display: the same pick, plus going back to the device setting. */
export function ThemeChoiceButtons() {
  const choice = useThemeChoice();
  const options: { id: ThemeChoice; label: string; icon: typeof SunIcon }[] = [
    { id: "light", label: "Light", icon: SunIcon },
    { id: "dark", label: "Dark", icon: MoonIcon },
    { id: "system", label: "Match device", icon: MonitorIcon },
  ];
  return (
    <div role="group" aria-label="Color theme" className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/50 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={choice === o.id}
          onClick={(e) => choice !== o.id && setTheme(o.id, centre(e))}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
            choice === o.id ? "bg-card font-medium text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <o.icon className="size-3.5" /> {o.label}
        </button>
      ))}
    </div>
  );
}
