import { useState } from "react";
import { FlaskConicalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoment } from "@/domain/dates";
import type { MessageKind } from "@/domain/types";
import { useApp } from "../context";
import { CopyButton, EmptyState, PageHeader, Who } from "../components/bits";

const KIND_LABEL: Record<MessageKind, string> = {
  order: "Order",
  chase: "Follow-up",
  reorder_alert: "Reorder alert",
  test: "Test",
};

export function MessagesView() {
  const { data } = useApp();
  const [kind, setKind] = useState<MessageKind | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const orderName = new Map(data.orders.map((o) => [o.id, o.name]));
  const messages = [...data.outbox].sort((a, b) => b.at.localeCompare(a.at)).filter((m) => kind === "all" || m.kind === kind);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Messages"
        description="Every order message, supplier follow-up and reorder alert, logged."
      />
      <div className="flex items-start gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
        <FlaskConicalIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p>
          <span className="font-medium">Email is in test mode.</span>{" "}
          <span className="text-muted-foreground">Nothing here was delivered. Open a message to copy it.</span>
        </p>
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {(["all", "order", "chase", "reorder_alert", "test"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={cn(
              "h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              kind === k ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {k === "all" ? "All" : KIND_LABEL[k]}
          </button>
        ))}
      </div>
      {messages.length === 0 ? (
        <EmptyState title="No messages yet" />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border surface">
          {messages.map((m) => {
            const open = openId === m.id;
            return (
              <li key={m.id}>
                <button
                  className="grid w-full gap-1 px-4 py-3 text-left hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
                  onClick={() => setOpenId(open ? null : m.id)}
                  aria-expanded={open}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{KIND_LABEL[m.kind]}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.subject}</span>
                    <span className="tnum text-xs text-muted-foreground">{formatMoment(m.at)}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    To {m.to.join(", ") || "nobody"} · by <Who actor={m.actor} />
                    {(m.orderIds ?? (m.orderId ? [m.orderId] : [])).length > 0 &&
                      ` · ${(m.orderIds ?? [m.orderId!]).map((id) => orderName.get(id) ?? "deleted order").join(", ")}`}
                  </div>
                </button>
                {open && (
                  <div className="grid gap-3 border-t bg-muted/30 px-4 py-3">
                    <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap">{m.body}</pre>
                    <div>
                      <CopyButton text={`To: ${m.to.join(", ")}\nSubject: ${m.subject}\n\n${m.body}`} label="Copy email" />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
