import { api } from "@/convex/_generated/api";
import { EmptyState, Money, PageHeader, Panel, Pill, Stat } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  computeLtv,
  formatDate,
  formatGrams,
  formatINR,
  METAL_LABELS,
  PURITY_LABELS,
} from "@/lib/gehnacloud";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Loader2,
  Plus,
  Scale,
  ShieldAlert,
  Signature,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_TONE: Record<string, "safe" | "warn" | "crit" | "neutral" | "info"> = {
  ACTIVE: "safe",
  OVERDUE: "warn",
  AUCTIONED: "crit",
  CLOSED: "neutral",
};

const PURITIES = [24, 22, 18, 925, 950];
const METALS = ["GOLD", "SILVER", "PLATINUM"] as const;

export default function Girvi() {
  const [status, setStatus] = useState("ALL");
  const [showJama, setShowJama] = useState(false);
  const [paying, setPaying] = useState<Id<"girviLoans"> | null>(null);

  const data = useQuery(api.girvi.list, { status });
  const customers = useQuery(api.customers.list, {});
  const rates = useQuery(api.rates.board);
  const createLoan = useMutation(api.girvi.createLoan);
  const recordPayment = useMutation(api.girvi.recordPayment);

  return (
    <div className="space-y-5">
      <PageHeader
        title="GehnaGirvi"
        description="Pledge, accrue and settle. Interest and LTV are recomputed against the live board on every render."
        action={
          <Button size="sm" onClick={() => setShowJama((s) => !s)}>
            <Plus className="size-4" />
            New Jama
          </Button>
        }
      />

      {data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Capital on the street"
            value={formatINR(data.summary.disbursed)}
            sub={`${data.summary.activeCount} open pledges`}
            icon={Scale}
            tone="gold"
          />
          <Stat
            label="Total due today"
            value={formatINR(data.summary.outstanding)}
            sub="Principal plus accrued interest"
          />
          <Stat
            label="Interest outstanding"
            value={formatINR(data.summary.interestDueThisMonth)}
            sub={`${data.summary.overdue} overdue · ${data.summary.closed} settled`}
          />
          <Stat
            label="Collateral held"
            value={formatGrams(data.summary.collateralWeight)}
            sub={`${data.summary.atRisk} above 75% LTV · ${data.summary.critical} critical`}
            tone={data.summary.atRisk > 0 ? "warn" : "neutral"}
          />
        </div>
      )}

      {data && data.summary.atRisk > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/35 bg-destructive/8 px-4 py-3.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            <strong className="text-foreground">
              {data.summary.atRisk} pledge{data.summary.atRisk > 1 ? "s are" : " is"} above
              the 75% loan-to-value threshold.
            </strong>{" "}
            A falling rate board shrinks the collateral under a fixed loan — these accounts
            should get a follow-up or an auction notice.
          </p>
        </div>
      )}

      {showJama && (
        <JamaPanel
          customers={customers?.customers ?? []}
          rates={rates ?? []}
          onClose={() => setShowJama(false)}
          onSubmit={async (args) => {
            try {
              await createLoan(args);
              toast.success("Jama recorded — pledge agreement created.");
              setShowJama(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not record the pledge");
            }
          }}
        />
      )}

      {paying && data && (
        <PaymentPanel
          loanId={paying}
          loan={data.loans.find((l) => l._id === paying)!}
          onClose={() => setPaying(null)}
          onSubmit={async (args) => {
            try {
              const res = await recordPayment(args);
              toast.success(
                res.status === "CLOSED"
                  ? `Chudai complete · NOC ${res.nocNumber}`
                  : "Payment recorded against the pledge.",
              );
              setPaying(null);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Payment failed");
            }
          }}
        />
      )}

      <Panel
        title="Pledge ledger"
        action={
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="ALL">All loans</option>
            <option value="ACTIVE">Active</option>
            <option value="OVERDUE">Overdue</option>
            <option value="CLOSED">Closed</option>
          </select>
        }
      >
        {!data || data.loans.length === 0 ? (
          <EmptyState
            icon={Scale}
            title="No pledges yet"
            hint="Record a Jama to start a Girvi book."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Loan</th>
                  <th className="px-5 py-2.5 font-medium">Pledger</th>
                  <th className="px-5 py-2.5 text-right font-medium">Net weight</th>
                  <th className="px-5 py-2.5 text-right font-medium">Advanced</th>
                  <th className="px-5 py-2.5 text-right font-medium">Interest</th>
                  <th className="px-5 py-2.5 text-right font-medium">Due</th>
                  <th className="px-5 py-2.5 font-medium">LTV</th>
                  <th className="px-5 py-2.5 font-medium">KYC</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {data.loans.map((l) => (
                  <tr key={l._id} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <p className="font-mono text-xs font-medium">{l.loanNumber}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDate(l.loanDate)} · {l.interestType.toLowerCase()} {l.annualInterestRate}%
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-[13px]">{l.customer?.name ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {l.customer?.phone ?? ""}
                      </p>
                    </td>
                    <td className="nums px-5 py-3 text-right text-xs">
                      {l.netWeight.toFixed(3)} g
                      <span className="block text-[11px] text-muted-foreground">
                        {METAL_LABELS[l.metalType]} {PURITY_LABELS[l.purityKarat as number] ?? l.purityKarat}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-xs">
                      <Money value={l.pledgedAmount} />
                    </td>
                    <td className="nums px-5 py-3 text-right text-xs text-muted-foreground">
                      {formatINR(l.interest.outstandingInterest)}
                      {l.interest.penalInterest > 0 && (
                        <span className="block text-[11px] text-destructive">
                          +{formatINR(l.interest.penalInterest)} penal
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-xs font-semibold text-primary">
                      {formatINR(l.interest.amountDue)}
                    </td>
                    <td className="px-5 py-3">
                      <Pill
                        tone={
                          l.ltv.severity === "CRITICAL"
                            ? "crit"
                            : l.ltv.breached
                              ? "warn"
                              : "safe"
                        }
                      >
                        {l.ltv.ltvPct}%
                      </Pill>
                    </td>
                    <td className="px-5 py-3">
                      {l.kycStatus === "VERIFIED" && l.signatureCaptured ? (
                        <Pill tone="safe">Complete</Pill>
                      ) : (
                        <Pill tone="warn">
                          <Signature className="size-3" />
                          Pending
                        </Pill>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {l.status !== "CLOSED" ? (
                        <Button size="sm" variant="outline" onClick={() => setPaying(l._id)}>
                          Collect
                        </Button>
                      ) : (
                        <Pill tone="neutral">Released</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function JamaPanel({
  customers,
  rates,
  onClose,
  onSubmit,
}: {
  customers: { _id: Id<"customers">; name: string; phone: string }[];
  rates: { metalType: string; purityKarat: number; ratePerGram: number }[];
  onClose: () => void;
  onSubmit: (args: {
    customerId: Id<"customers">;
    metalType: "GOLD" | "SILVER" | "PLATINUM";
    purityKarat: 24 | 22 | 18 | 925 | 950;
    grossWeight: number;
    netWeight: number;
    pledgedAmount: number;
    annualInterestRate: number;
    interestType: "SIMPLE" | "COMPOUND";
    graceMonths: number;
    kycStatus: string;
    signatureCaptured: boolean;
  }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    customerId: (customers[0]?._id ?? "") as Id<"customers">,
    metalType: "GOLD" as "GOLD" | "SILVER" | "PLATINUM",
    purityKarat: 22 as number,
    grossWeight: 0,
    stoneWeight: 0,
    pledgedAmount: 0,
    annualInterestRate: 1.5,
    interestType: "SIMPLE" as "SIMPLE" | "COMPOUND",
    graceMonths: 1,
    kycStatus: "VERIFIED",
    signatureCaptured: true,
  });

  const netWeight = Math.max(
    0,
    Math.round((form.grossWeight - form.stoneWeight) * 1000) / 1000,
  );
  const rate =
    rates.find((r) => r.metalType === form.metalType && r.purityKarat === form.purityKarat)
      ?.ratePerGram ?? 0;
  const ltv = computeLtv(form.pledgedAmount, netWeight, rate);

  const field = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm nums";
  const label = "text-[10px] uppercase tracking-wider text-muted-foreground";

  return (
    <Panel
      title="Record a Jama (pledge)"
      description="Advances above 85% of live collateral value are refused by the server."
      action={
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      }
    >
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block lg:col-span-2">
          <span className={label}>Pledger</span>
          <select
            className={`${field} mt-1`}
            value={form.customerId}
            onChange={(e) =>
              setForm({ ...form, customerId: e.target.value as Id<"customers"> })
            }
          >
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} · {c.phone}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Metal</span>
          <select
            className={`${field} mt-1`}
            value={form.metalType}
            onChange={(e) =>
              setForm({ ...form, metalType: e.target.value as typeof form.metalType })
            }
          >
            {METALS.map((m) => (
              <option key={m} value={m}>
                {METAL_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Purity</span>
          <select
            className={`${field} mt-1`}
            value={form.purityKarat}
            onChange={(e) => setForm({ ...form, purityKarat: Number(e.target.value) })}
          >
            {PURITIES.map((p) => (
              <option key={p} value={p}>
                {PURITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Gross weight (g)</span>
          <input
            type="number" step="0.001" min="0"
            className={`${field} mt-1`}
            value={form.grossWeight}
            onChange={(e) => setForm({ ...form, grossWeight: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block">
          <span className={label}>Stone weight (g)</span>
          <input
            type="number" step="0.001" min="0"
            className={`${field} mt-1`}
            value={form.stoneWeight}
            onChange={(e) => setForm({ ...form, stoneWeight: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block">
          <span className={label}>Net weight (g)</span>
          <p className="nums mt-1 h-9 rounded-md bg-muted px-2.5 py-1.5 text-sm font-semibold text-primary">
            {netWeight.toFixed(3)} g
          </p>
        </label>
        <label className="block">
          <span className={label}>Pledged amount ₹</span>
          <input
            type="number" step="1000" min="0"
            className={`${field} mt-1`}
            value={form.pledgedAmount}
            onChange={(e) => setForm({ ...form, pledgedAmount: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block">
          <span className={label}>Interest % p.a.</span>
          <input
            type="number" step="0.05" min="0"
            className={`${field} mt-1`}
            value={form.annualInterestRate}
            onChange={(e) => setForm({ ...form, annualInterestRate: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block">
          <span className={label}>Interest type</span>
          <select
            className={`${field} mt-1`}
            value={form.interestType}
            onChange={(e) =>
              setForm({ ...form, interestType: e.target.value as typeof form.interestType })
            }
          >
            <option value="SIMPLE">Simple</option>
            <option value="COMPOUND">Compound</option>
          </select>
        </label>
        <label className="block">
          <span className={label}>Grace months</span>
          <input
            type="number" step="1" min="0"
            className={`${field} mt-1`}
            value={form.graceMonths}
            onChange={(e) => setForm({ ...form, graceMonths: Number(e.target.value) || 0 })}
          />
        </label>
        <div className="rounded-md bg-muted px-3 py-2">
          <span className={label}>Loan-to-value</span>
          <div className="mt-0.5 flex items-center gap-2">
            <p
              className={`nums text-sm font-semibold ${
                ltv.breached ? "text-destructive" : "text-primary"
              }`}
            >
              {ltv.ltvPct}%
            </p>
            {ltv.breached && <ShieldAlert className="size-3.5 text-destructive" />}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Collateral {formatINR(ltv.collateralValue)}
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={busy || !form.customerId || netWeight <= 0 || form.pledgedAmount <= 0 || ltv.breached}
          onClick={async () => {
            setBusy(true);
            await onSubmit({
              customerId: form.customerId,
              metalType: form.metalType,
              purityKarat: form.purityKarat as 22,
              grossWeight: form.grossWeight,
              netWeight,
              pledgedAmount: form.pledgedAmount,
              annualInterestRate: form.annualInterestRate,
              interestType: form.interestType,
              graceMonths: form.graceMonths,
              kycStatus: form.kycStatus,
              signatureCaptured: form.signatureCaptured,
            });
            setBusy(false);
          }}
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Record pledge
        </Button>
      </div>
    </Panel>
  );
}

function PaymentPanel({
  loanId,
  loan,
  onClose,
  onSubmit,
}: {
  loanId: Id<"girviLoans">;
  loan: {
    loanNumber: string;
    pledgedAmount: number;
    interest: {
      outstandingInterest: number;
      outstandingPrincipal: number;
      amountDue: number;
      chargeableMonths: number;
    };
  };
  onClose: () => void;
  onSubmit: (args: {
    loanId: Id<"girviLoans">;
    kind: "INTEREST" | "PRINCIPAL" | "SETTLEMENT";
    amount: number;
    mode: "CASH" | "UPI" | "CARD" | "BANK";
    note?: string;
  }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"INTEREST" | "PRINCIPAL" | "SETTLEMENT">("INTEREST");
  const [amount, setAmount] = useState(loan.interest.outstandingInterest);
  const [mode, setMode] = useState<"CASH" | "UPI" | "CARD" | "BANK">("CASH");

  const pick = (k: typeof kind) => {
    setKind(k);
    setAmount(
      k === "INTEREST"
        ? loan.interest.outstandingInterest
        : k === "PRINCIPAL"
          ? loan.interest.outstandingPrincipal
          : loan.interest.amountDue,
    );
  };

  const field = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm nums";
  const label = "text-[10px] uppercase tracking-wider text-muted-foreground";

  return (
    <Panel
      title={`Collect against ${loan.loanNumber}`}
      description="Interest is always applied before principal."
      action={
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      }
    >
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className={label}>Payment type</span>
          <select className={`${field} mt-1`} value={kind} onChange={(e) => pick(e.target.value as typeof kind)}>
            <option value="INTEREST">Be-Cash — interest only</option>
            <option value="PRINCIPAL">Be-Cash — principal</option>
            <option value="SETTLEMENT">Chudai — full settlement</option>
          </select>
        </label>
        <label className="block">
          <span className={label}>Amount ₹</span>
          <input
            type="number" min="0"
            className={`${field} mt-1`}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
          />
        </label>
        <label className="block">
          <span className={label}>Mode</span>
          <select
            className={`${field} mt-1`}
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="BANK">Bank transfer</option>
          </select>
        </label>
        <div className="rounded-md bg-muted px-3 py-2">
          <span className={label}>Remaining after</span>
          <p className="nums mt-0.5 text-sm font-semibold text-primary">
            {formatINR(Math.max(0, loan.interest.amountDue - amount))}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {kind === "SETTLEMENT" ? "NOC generated on completion" : `${loan.interest.chargeableMonths} chargeable months`}
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={busy || amount <= 0}
          onClick={async () => {
            setBusy(true);
            await onSubmit({ loanId, kind, amount, mode });
            setBusy(false);
          }}
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Record payment
        </Button>
      </div>
    </Panel>
  );
}
