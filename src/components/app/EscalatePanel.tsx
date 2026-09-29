import { api } from "@/convex/_generated/api";
import { WhatsAppSend } from "@/components/app/WhatsAppSend";
import { Panel, Pill } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { formatDate, formatGrams, formatINR } from "@/lib/gehnacloud";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Gavel, Loader2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

const STAGES = [
  { n: 1, title: "Friendly reminder", detail: "Call the pledger; interest is accruing." },
  { n: 2, title: "Formal notice", detail: "Issue a written notice; NOC number is generated." },
  { n: 3, title: "Auction", detail: "Pledge is auctioned and written off." },
] as const;

/**
 * PRD Module 1 — auction notice workflow.
 *
 * The ladder only ever moves forward. Stage 2 mints the notice number that the
 * letter and the WhatsApp dispatch both quote; stage 3 marks the pledge
 * auctioned, which the overdue and risk reports pick up immediately.
 */
export function EscalatePanel({
  loan,
  onClose,
  onDone,
}: {
  loan: {
    _id: Id<"girviLoans">;
    loanNumber: string;
    netWeight: number;
    customer: { name: string } | null;
    interest: { amountDue: number; outstandingInterest: number };
    escalationStage?: number;
    auctionNoticeNumber?: string;
    status: string;
  };
  onClose: () => void;
  onDone: () => void;
}) {
  const escalate = useMutation(api.girvi.escalate);
  const writeOff = useMutation(api.girvi.releaseToStock);
  const [busy, setBusy] = useState<number | null>(null);

  const current = loan.escalationStage ?? 0;

  const advance = async (toStage?: number) => {
    setBusy(toStage ?? current + 1);
    try {
      const res = await escalate({ loanId: loan._id, toStage });
      toast.success(
        res.stage >= 2
          ? `Formal notice ${res.noticeNumber} issued.`
          : `Escalated to stage ${res.stage}.`,
      );
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not escalate");
    } finally {
      setBusy(null);
    }
  };

  const release = async () => {
    setBusy(-1);
    try {
      await writeOff({
        loanId: loan._id,
        note: "Auctioned — collateral returned to the stock book.",
      });
      toast.success("Pledge written off and released to stock.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not release");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel
      title={`Escalation — ${loan.loanNumber}`}
      description={`${loan.customer?.name ?? "Pledger"} · ${formatGrams(loan.netWeight)} · ${formatINR(loan.interest.amountDue)} due`}
      action={
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      }
    >
      <div className="space-y-3 px-5 py-4">
        {STAGES.map((s) => {
          const done = current >= s.n;
          const next = current + 1 === s.n;
          return (
            <div
              key={s.n}
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                done
                  ? "border-destructive/30 bg-destructive/8"
                  : next
                    ? "border-primary/40 bg-primary/8"
                    : "border-border/70"
              }`}
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  done
                    ? "bg-destructive text-destructive-foreground"
                    : next
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {s.n}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-[11px] text-muted-foreground">{s.detail}</p>
              </div>
              {next && current < 3 && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => advance(s.n)}
                  >
                    {busy === s.n && <Loader2 className="size-3.5 animate-spin" />}
                    Issue
                  </Button>
                  {s.n === 2 && (
                    <WhatsAppSend kind="AUCTION_NOTICE" loanId={loan._id} />
                  )}
                </div>
              )}
              {done && <Pill tone="crit">Done</Pill>}
            </div>
          );
        })}

        {loan.auctionNoticeNumber && (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Notice{" "}
            <span className="font-mono font-semibold text-foreground">
              {loan.auctionNoticeNumber}
            </span>{" "}
            issued on {formatDate(Date.now())}.
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <TriangleAlert className="size-3" />
            Writing off releases the collateral into stock.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null || loan.status === "CLOSED"}
            onClick={release}
          >
            {busy === -1 ? <Loader2 className="size-3.5 animate-spin" /> : <Gavel className="size-3.5" />}
            Write off &amp; release
          </Button>
        </div>
      </div>
    </Panel>
  );
}
