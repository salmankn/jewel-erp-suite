import { api } from "@/convex/_generated/api";
import { Money, Panel, Pill } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import {
  formatDate,
  formatINR,
  METAL_LABELS,
  PURITY_LABELS,
} from "@/lib/gehnacloud";
import { useQuery } from "convex/react";
import { CircleCheck, Loader2, Receipt, TriangleAlert, Wallet, X } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

const KIND_LABEL: Record<string, string> = {
  INTEREST: "Interest",
  PRINCIPAL: "Principal",
  SETTLEMENT: "Chudai settlement",
};

/**
 * Full pledge ledger for one loan.
 *
 * Everything here is recomputed server-side on every render, so the interest
 * and LTV shown are never stale: a rate fall on the board immediately moves the
 * collateral value and the LTV percentage in this panel.
 */
export function LoanDetailPanel({
  loanId,
  onClose,
  onCollect,
  onEscalate,
}: {
  loanId: Id<"girviLoans">;
  onClose: () => void;
  onCollect: () => void;
  onEscalate: () => void;
}) {
  const data = useQuery(api.girvi.detail, { loanId });

  return (
    <Panel
      title={`Pledge ledger — ${data?.loan.loanNumber ?? "…"}`}
      description={
        data
          ? `${data.customer?.name ?? "Pledger"} · ${formatDate(data.loan.loanDate)} · ${data.loan.interestType.toLowerCase()} ${data.loan.annualInterestRate}% p.a.`
          : undefined
      }
      action={
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      }
    >
      {!data ? (
        <div className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading ledger…
        </div>
      ) : (
        <div className="space-y-0">
          {/* ── Collateral + live valuation ─────────────────────────────── */}
          <div className="grid gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-4">
            <Cell
              label="Collateral"
              value={
                <>
                  {data.loan.netWeight.toFixed(3)} g
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    {METAL_LABELS[data.loan.metalType]}{" "}
                    {PURITY_LABELS[data.loan.purityKarat as number] ?? data.loan.purityKarat}
                  </span>
                </>
              }
            />
            <Cell
              label="Live rate"
              value={
                <>
                  {formatINR(data.ratePerGram, true)}
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    per gram today
                  </span>
                </>
              }
            />
            <Cell
              label="Collateral value"
              value={formatINR(data.ltv.collateralValue)}
              sub={`${data.loan.grossWeight.toFixed(3)}g gross less stones`}
            />
            <Cell
              label="LTV"
              value={
                <Pill
                  tone={
                    data.ltv.severity === "CRITICAL"
                      ? "crit"
                      : data.ltv.breached
                        ? "warn"
                        : "safe"
                  }
                >
                  {data.ltv.ltvPct}%
                </Pill>
              }
              sub={data.ltv.breached ? "Above the 75% alert line" : "Comfortable headroom"}
            />
          </div>

          {/* ── Money position ──────────────────────────────────────────── */}
          <div className="grid gap-x-6 gap-y-3 border-t border-border/70 px-5 py-4 sm:grid-cols-4">
            <Cell label="Advanced" value={formatINR(data.loan.pledgedAmount)} />
            <Cell
              label="Principal repaid"
              value={formatINR(data.loan.principalPaid)}
              sub={`${formatINR(Math.max(0, data.loan.pledgedAmount - data.loan.principalPaid))} outstanding`}
            />
            <Cell
              label="Interest accrued"
              value={formatINR(data.interest.outstandingInterest)}
              sub={
                data.interest.penalInterest > 0
                  ? `+ ${formatINR(data.interest.penalInterest)} penal`
                  : data.loan.interestPaid > 0
                    ? `${formatINR(data.loan.interestPaid)} collected`
                    : "none collected yet"
              }
            />
            <Cell
              label="Total due"
              value={
                <span className="text-primary">
                  {formatINR(data.interest.amountDue)}
                </span>
              }
              sub={`${data.interest.chargeableMonths} of ${data.interest.monthsElapsed} months charged${
                data.loan.graceMonths > 0 ? ` · ${data.loan.graceMonths} grace` : ""
              }`}
            />
          </div>

          {/* ── Terms + compliance ──────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 px-5 py-3">
            <Pill
              tone={
                data.loan.status === "CLOSED"
                  ? "neutral"
                  : data.loan.status === "AUCTIONED"
                    ? "crit"
                    : data.loan.status === "OVERDUE"
                      ? "warn"
                      : "safe"
              }
            >
              {data.loan.status}
            </Pill>
            <Pill tone={data.loan.kycStatus === "VERIFIED" ? "safe" : "warn"}>
              KYC {data.loan.kycStatus.toLowerCase()}
            </Pill>
            <Pill tone={data.loan.signatureCaptured ? "safe" : "warn"}>
              {data.loan.signatureCaptured ? "Signed" : "Unsigned"}
            </Pill>
            {data.loan.escalationStage != null && data.loan.escalationStage > 0 && (
              <Pill tone={data.loan.escalationStage >= 2 ? "warn" : "info"}>
                Escalation stage {data.loan.escalationStage}
              </Pill>
            )}
            {data.loan.auctionNoticeNumber && (
              <span className="font-mono text-[11px] text-muted-foreground">
                Notice {data.loan.auctionNoticeNumber}
              </span>
            )}
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={onEscalate}>
                <TriangleAlert className="size-3.5" />
                Escalate
              </Button>
              <Button
                size="sm"
                onClick={onCollect}
                disabled={data.loan.status === "CLOSED"}
              >
                <Wallet className="size-3.5" />
                Collect
              </Button>
            </div>
          </div>

          {/* ── Payment history ─────────────────────────────────────────── */}
          <div className="border-t border-border/70">
            <p className="flex items-center gap-1.5 px-5 pb-2 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <Receipt className="size-3" />
              Repayment history
            </p>
            {data.payments.length === 0 ? (
              <p className="px-5 pb-5 text-xs text-muted-foreground">
                Nothing collected yet — interest is still running from the loan date.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border/70 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-2 font-medium">Date</th>
                      <th className="px-5 py-2 font-medium">Kind</th>
                      <th className="px-5 py-2 font-medium">Mode</th>
                      <th className="px-5 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {data.payments.map((p) => (
                      <tr key={p._id}>
                        <td className="px-5 py-2.5 text-xs">{formatDate(p.at)}</td>
                        <td className="px-5 py-2.5 text-xs">
                          {KIND_LABEL[p.kind] ?? p.kind}
                          {p.note && (
                            <span className="block text-[11px] text-muted-foreground">
                              {p.note}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-xs text-muted-foreground">
                          {p.mode}
                        </td>
                        <td className="px-5 py-2.5 text-right text-xs">
                          <Money value={p.amount} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border/70 text-xs">
                      <td className="px-5 py-2.5 text-muted-foreground" colSpan={3}>
                        <span className="inline-flex items-center gap-1.5">
                          <CircleCheck className="size-3" />
                          Total collected
                        </span>
                      </td>
                      <td className="nums px-5 py-2.5 text-right font-semibold">
                        {formatINR(data.payments.reduce((a, p) => a + p.amount, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Cell({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="nums mt-1 text-sm font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
