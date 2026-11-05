import { useState } from "react";
import { SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { chaseMessage, orderMessage } from "@/domain/messages";
import { recordChase, recordOrderMessage } from "@/domain/mutations";
import { CHASE_LABEL } from "@/domain/orders";
import type { ChaseKind } from "@/domain/types";
import { useApp } from "../context";
import { CopyButton, Field } from "../components/bits";

/**
 * Prepares the order message or a follow-up. Email runs in test mode, so
 * "Mark as sent" logs it in Messages and nothing is delivered; staff copy
 * the text into their own email.
 */
export function MessageDialog({ orderId, chase, onClose }: { orderId: string; chase?: ChaseKind; onClose: () => void }) {
  const { data, report, run } = useApp();
  const view = report.orderById.get(orderId);
  const alert = view?.alerts.find((a) => a.kind === chase);
  const draft = view
    ? chase
      ? chaseMessage(chase, view.order, view.progress, alert ?? { reason: "" }, view.product, view.supplier, data.settings)
      : orderMessage(view.order, view.product, view.supplier, data.settings)
    : null;
  const [to, setTo] = useState(draft?.to.join(", ") ?? "");
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  if (!view || !draft) return null;

  const full = `To: ${to}\nSubject: ${subject}\n\n${body}`;
  const recipients = to.split(/[,;\s]+/).filter(Boolean);
  const title = chase ? `${CHASE_LABEL[chase]}: ${view.order.name}` : `Send ${view.order.name} to the supplier`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {chase && alert ? `${alert.reason}. ` : ""}
            Email is in test mode: nothing is delivered. Copy the text into your email, then mark it sent to log it
            {chase ? " and pause this alert for 2 days." : "."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field id="msg-to" label="To">
            <Input id="msg-to" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field id="msg-subject" label="Subject">
            <Input id="msg-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field id="copy-source" label="Message">
            <Textarea id="copy-source" value={body} onChange={(e) => setBody(e.target.value)} rows={11} className="font-mono text-xs leading-relaxed" />
          </Field>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <CopyButton text={full} label="Copy email" />
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {chase ? "Not now" : "Skip"}
            </Button>
            <Button
              disabled={!recipients.length}
              onClick={async () => {
                const msg = { to: recipients, subject, body };
                const ok = await run(
                  (s, a, now) => (chase ? recordChase(s, orderId, chase, msg, a, now) : recordOrderMessage(s, orderId, msg, a, now)),
                  "Logged in Messages (test mode, not delivered)",
                );
                if (ok) onClose();
              }}
            >
              <SendIcon /> Mark as sent
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
