import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useAction, useQuery } from "convex/react";
import { CircleSlash, Loader2, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Sends an invoice, interest-due reminder or auction notice over WhatsApp.
 *
 * The copy is composed server-side from the live ledger (so the figures can
 * never drift from the books), previewed here, and only then delivered.
 *
 * `compose` returns `{ ok: false, reason }` rather than throwing when a record
 * cannot be messaged — a borrower with no phone on file is ordinary data, not
 * an error. The button disables itself and carries the reason as its tooltip,
 * so one undeliverable row can never take the surrounding page down with it.
 */
export function WhatsAppSend({
  kind,
  invoiceId,
  loanId,
  disabled,
  label,
}: {
  kind: "INVOICE" | "INTEREST_DUE" | "AUCTION_NOTICE";
  invoiceId?: Id<"invoices">;
  loanId?: Id<"girviLoans">;
  disabled?: boolean;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const deliver = useAction(api.whatsapp.deliver);

  const composed = useQuery(
    api.whatsapp.compose,
    disabled ? "skip" : { kind, invoiceId, loanId },
  );

  const blocked = composed && !composed.ok ? composed.reason : null;
  const message = composed?.ok ? composed : null;

  const send = async () => {
    if (!message) return;
    setBusy(true);
    try {
      const res = await deliver({
        message: {
          to: message.to,
          body: message.body,
          amountDue: message.amountDue,
          kind: message.kind,
          customerId: message.customerId,
          loanId: message.loanId,
          invoiceId: message.invoiceId,
        },
      });
      if (res.status === "SENT") toast.success(`Sent to ${res.to}.`);
      else if (res.status === "SKIPPED") toast.warning(res.error ?? "WhatsApp not configured.");
      else toast.error(res.error ?? "Delivery failed — see the outbox.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled || busy || !message}
      onClick={send}
      title={
        blocked
          ? blocked
          : message
            ? `Preview message to ${message.to}`
            : disabled
              ? "Not available for this record"
              : "Preparing message…"
      }
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : blocked ? (
        <CircleSlash className="size-3.5 text-muted-foreground" />
      ) : (
        <MessageCircle className="size-3.5" />
      )}
      {label ?? ""}
    </Button>
  );
}
