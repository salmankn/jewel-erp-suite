import { api } from "@/convex/_generated/api";
import { Panel, Pill } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { formatDate, formatGrams, formatINR } from "@/lib/gehnacloud";
import { useMutation } from "convex/react";
import { ArrowRightLeft, Loader2, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Hand a pledge over to a different borrower.
 *
 * The collateral, loan date and interest terms stay put — only the borrower
 * changes — so accrued interest is never reset by a transfer. That is exactly
 * the loophole the reason field and the audit entry exist to close.
 */
export function TransferPanel({
  loan,
  customers,
  onClose,
  onDone,
}: {
  loan: {
    _id: Id<"girviLoans">;
    loanNumber: string;
    netWeight: number;
    pledgedAmount: number;
    loanDate: number;
    customer: { _id: Id<"customers">; name: string; phone: string } | null;
  };
  customers: { _id: Id<"customers">; name: string; phone: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const transfer = useMutation(api.girvi.transfer);
  const [busy, setBusy] = useState(false);

  const options = customers.filter((c) => c._id !== loan.customer?._id);
  const [toId, setToId] = useState<string>(options[0]?._id ?? "");
  const [reason, setReason] = useState("");
  const target = options.find((c) => c._id === toId);

  const submit = async () => {
    if (!toId) return;
    setBusy(true);
    try {
      await transfer({
        loanId: loan._id,
        toCustomerId: toId as Id<"customers">,
        reason: reason.trim() || undefined,
      });
      toast.success(`${loan.loanNumber} transferred to ${target?.name}.`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not transfer");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={`Transfer pledge — ${loan.loanNumber}`}
      description={`${formatGrams(loan.netWeight)} · ${formatINR(loan.pledgedAmount)} advanced ${formatDate(loan.loanDate)}`}
      action={
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Holder</span>
          <Pill tone="neutral">{loan.customer?.name ?? "Unknown"}</Pill>
          <ArrowRightLeft className="size-3.5 text-muted-foreground" />
          <Pill tone="gold">{target?.name ?? "Select…"}</Pill>
          {target?.phone && (
            <span className="text-[11px] text-muted-foreground">{target.phone}</span>
          )}
        </div>

        {options.length === 0 ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            No other customer on file to transfer this pledge to. Add a customer first.
          </p>
        ) : (
          <>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                New borrower
              </span>
              <select
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
              >
                {options.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} — {c.phone}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Reason (goes into the audit trail)
              </span>
              <input
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Borrower's request, family settlement"
              />
            </label>

            <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" />
              Collateral, loan date and accrued interest carry over unchanged — only the
              borrower changes. The KYC papers on file still belong to the previous holder.
            </p>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={busy || !toId}
          onClick={async () => {
            await submit();
          }}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRightLeft className="size-3.5" />}
          Transfer pledge
        </Button>
      </div>
    </Panel>
  );
}
