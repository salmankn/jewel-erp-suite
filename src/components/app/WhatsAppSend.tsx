import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useAction, useQuery } from "convex/react";
import { Loader2, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Sends an invoice, interest-due reminder or auction notice over WhatsApp.
 *
 * The copy is composed server-side from the live ledger (so the figures can
 * never drift from the books), previewed here, and only then delivered.
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

  const send = async () => {
    if (!composed) return;
    setBusy(true);
    try {
      const res = await deliver({ message: composed });
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
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled || busy || !composed}
        onClick={send}
        title={
          composed
            ? `Preview message to ${composed.to}`
            : "Message not available yet"
        }
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <MessageCircle className="size-3.5" />
        )}
        {label ?? ""}
      </Button>
    </>
  );
}
