import { useEffect, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Actor } from "@/domain/types";
import { useApp } from "../context";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** A labelled number, for detail panels. */
export function Stat({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "out" | "reorder" | "urgent" | "watch" | "ok";
  className?: string;
}) {
  const toneCls = tone
    ? { out: "text-st-out", reorder: "text-st-reorder", urgent: "text-st-urgent", watch: "text-st-watch", ok: "text-st-ok" }[tone]
    : "";
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("tnum mt-0.5 text-lg font-semibold tracking-tight", toneCls)}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Who did something, as this viewer should read it. Ids are resolved to names; names are never stored. */
export function Who({ actor }: { actor: Actor | null }) {
  const { data, store, actor: me } = useApp();
  const [name, setName] = useState<string>("");
  const userId = actor?.userId ?? null;
  useEffect(() => {
    let live = true;
    if (userId && store.user) {
      store.user.profiles([userId]).then((p) => {
        if (live) setName(p[userId]?.name || "");
      });
    } else setName("");
    return () => {
      live = false;
    };
  }, [userId, store.user]);

  if (!actor) return <span className="text-muted-foreground">System</span>;
  if (actor.role === "supplier") {
    const s = data.suppliers.find((x) => x.id === actor.supplierId);
    return <span>{name ? `${name}, ` : ""}{s?.name ?? "Supplier"}</span>;
  }
  const isMe = userId ? userId === me.userId : false;
  return <span>{name ? `${name}${isMe ? " (you)" : ""}` : "Ops staff"}</span>;
}

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        } catch {
          // Clipboard refused (some app views): select the text so Ctrl/Cmd+C works.
          const el = document.getElementById("copy-source");
          if (el instanceof HTMLTextAreaElement) {
            el.focus();
            el.select();
          }
        }
      }}
    >
      {done ? <CheckIcon /> : <CopyIcon />}
      {done ? "Copied" : label}
    </Button>
  );
}

export function Field({ id, label, hint, children, className }: { id: string; label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Whole-number input that keeps a string while typing and reports a number (NaN when empty). */
export function UnitsInput({
  id,
  value,
  onChange,
  min = 0,
  placeholder,
  className,
  autoFocus,
  allowNegative,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  allowNegative?: boolean;
}) {
  return (
    <Input
      id={id}
      inputMode={allowNegative ? "text" : "numeric"}
      autoComplete="off"
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={cn("tnum", className)}
      onChange={(e) => {
        const v = e.target.value.replace(allowNegative ? /[^\d-]/g : /[^\d]/g, "");
        onChange(v);
      }}
      min={min}
    />
  );
}

export function toInt(v: string): number {
  if (v.trim() === "" || v === "-") return NaN;
  return Number.parseInt(v, 10);
}

export function Confirm({
  open,
  onOpenChange,
  title,
  body,
  confirm,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body: ReactNode;
  confirm: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground">{body}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            onClick={onConfirm}
          >
            {confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      {icon && <div className="text-muted-foreground [&_svg]:size-6">{icon}</div>}
      <div className="font-medium">{title}</div>
      {children && <div className="max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

/** A card-like section with a header row. */
export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
  description,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  description?: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border surface", className)}>
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function go(hash: string) {
  window.location.hash = hash;
}
