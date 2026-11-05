import { useMemo, useState } from "react";
import { ChevronDownIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { chaseMessage } from "@/domain/messages";
import { merge, recordChase } from "@/domain/mutations";
import { CHASE_LABEL } from "@/domain/orders";
import { useApp } from "../context";
import { CopyButton } from "../components/bits";

/** Every follow-up that's due, prepared together: copy them all, then log them all as sent. */
export function ChaseAllDialog({ onClose }: { onClose: () => void }) {
  const { report, data, run } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const drafts = useMemo(
    () =>
      report.chaseDue.flatMap((a) => {
        const v = report.orderById.get(a.orderId);
        if (!v) return [];
        return [{ alert: a, view: v, draft: chaseMessage(a.kind, v.order, v.progress, a, v.product, v.supplier, data.settings) }];
      }),
    [report, data.settings],
  );
  const all = drafts.map((d) => `To: ${d.draft.to.join(", ")}\nSubject: ${d.draft.subject}\n\n${d.draft.body}`).join("\n\n----------\n\n");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Follow up on {drafts.length} supplier orders</DialogTitle>
          <DialogDescription>
            Each message is ready to send. Email is in test mode, so copy them into your email, then mark them sent. Each alert pauses for 2 days.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border">
          {drafts.map(({ alert, view, draft }) => {
            const key = `${alert.orderId}-${alert.kind}`;
            const isOpen = open === key;
            return (
              <li key={key}>
                <button
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : key)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="font-mono font-medium">{view.order.name}</span> · {CHASE_LABEL[alert.kind]}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      To {draft.to.join(", ")} · {draft.subject}
                    </div>
                  </div>
                  <ChevronDownIcon className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && <pre className="border-t bg-muted/30 px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap">{draft.body}</pre>}
              </li>
            );
          })}
        </ul>
        <textarea id="copy-source" readOnly value={all} className="sr-only" aria-hidden tabIndex={-1} />
        <DialogFooter className="gap-2 sm:justify-between">
          <CopyButton text={all} label={`Copy all ${drafts.length}`} />
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Not now
            </Button>
            <Button
              disabled={!drafts.length}
              onClick={async () => {
                const ok = await run(
                  (s, a, now) => merge(...drafts.map((d) => recordChase(s, d.alert.orderId, d.alert.kind, d.draft, a, now))),
                  `${drafts.length} follow-ups logged (test mode, not delivered)`,
                );
                if (ok) onClose();
              }}
            >
              <SendIcon /> Mark all {drafts.length} as sent
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
