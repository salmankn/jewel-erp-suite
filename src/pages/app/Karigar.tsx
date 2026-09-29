import { api } from "@/convex/_generated/api";
import { EmptyState, Money, PageHeader, Panel, Pill, Stat } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import {
  computeWastage,
  formatDate,
  formatGrams,
  formatINR,
  PURITY_LABELS,
} from "@/lib/gehnacloud";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  BanknoteArrowUp,
  Loader2,
  PackageCheck,
  Plus,
  Scale,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const PURITIES = [24, 22, 18, 925, 950];

export default function Karigar() {
  const [showIssue, setShowIssue] = useState(false);
  const [receiving, setReceiving] = useState<Id<"karigarJobs"> | null>(null);
  const [settling, setSettling] = useState<Id<"karigars"> | null>(null);
  const data = useQuery(api.karigar.list);
  const issueJob = useMutation(api.karigar.issueJob);
  const receiveJob = useMutation(api.karigar.receiveJob);
  const settleLabour = useMutation(api.karigar.settleLabour);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Karigar & job work"
        description="Fine metal issued against finished ornaments returned — reconciled on purity, not gross weight."
        action={
          <Button size="sm" onClick={() => setShowIssue((s) => !s)}>
            <Plus className="size-4" />
            Issue metal
          </Button>
        }
      />

      {data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            index={0}
            label="Karigars"
            value={data.summary.karigarCount}
            sub={`${data.summary.openJobs} open job cards`}
            icon={Wrench}
            tone="gold"
          />
          <Stat
            index={1}
            label="Metal out with them"
            value={formatGrams(data.summary.metalOut)}
            sub="Issued and not yet returned"
            icon={Scale}
          />
          <Stat
            index={2}
            label="Ghat balance"
            value={formatGrams(data.summary.metalInHand)}
            sub="Pure metal in their custody"
          />
          <Stat
            index={3}
            label="Labour payable"
            value={formatINR(data.summary.labourPayable)}
            sub={
              data.summary.excessWastageJobs > 0
                ? `${data.summary.excessWastageJobs} job over wastage allowance`
                : "All jobs within allowance"
            }
            icon={Wallet}
            tone={data.summary.excessWastageJobs > 0 ? "warn" : "neutral"}
          />
        </div>
      )}

      {showIssue && data && (
        <IssuePanel
          karigars={data.karigars}
          onClose={() => setShowIssue(false)}
          onSubmit={async (args) => {
            try {
              await issueJob(args);
              toast.success("Metal issued — added to the karigar's ghat.");
              setShowIssue(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not issue metal");
            }
          }}
        />
      )}

      {receiving && data && (
        <ReceivePanel
          job={data.jobs.find((j) => j._id === receiving)!}
          onClose={() => setReceiving(null)}
          onSubmit={async (args) => {
            try {
              const res = await receiveJob(args);
              toast.success(
                res.wastage.withinAllowance
                  ? `Received. Wastage ${res.wastage.wastagePct}% is within allowance.`
                  : `Received, but wastage ${res.wastage.wastagePct}% is OVER the allowance.`,
              );
              setReceiving(null);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not receive job");
            }
          }}
        />
      )}

      {settling && data && (
        <SettlePanel
          karigar={data.karigars.find((k) => k._id === settling)!}
          onClose={() => setSettling(null)}
          onSubmit={async (amount) => {
            try {
              await settleLabour({ karigarId: settling, amount });
              toast.success(`₹${Math.round(amount).toLocaleString("en-IN")} paid out.`);
              setSettling(null);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not settle labour");
            }
          }}
        />
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Panel title="Karigar accounts" className="lg:col-span-2">
            <div className="divide-y divide-border/70">
              {data.karigars.map((k) => (
                <div key={k._id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{k.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {k.specialty ?? "—"} · {k.phone}
                      </p>
                    </div>
                    {k.openJobs > 0 && (
                      <Pill tone="warn">{k.openJobs} open</Pill>
                    )}
                  </div>                    <div className="mt-2.5 flex items-center gap-5 text-xs">
                      <span className="text-muted-foreground">
                        Ghat{" "}
                        <strong className="nums ml-1 text-primary">
                          {k.metalInHand.toFixed(3)} g
                        </strong>
                      </span>
                      <span className="text-muted-foreground">
                        Labour{" "}
                        <strong className="nums ml-1 text-foreground">
                          {formatINR(k.cashBalance)}
                        </strong>
                      </span>
                      {k.cashBalance > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto"
                          onClick={() => setSettling(k._id)}
                        >
                          <BanknoteArrowUp className="size-3.5" />
                          Settle
                        </Button>
                      )}
                    </div>
                </div>
              ))}
              {data.karigars.length === 0 && (
                <EmptyState icon={Wrench} title="No karigars on file" />
              )}
            </div>
          </Panel>

          <Panel
            title="Job cards"
            description="Wastage is measured on fine metal, in grams and as a share of issue."
            className="lg:col-span-3"
          >
            {data.jobs.length === 0 ? (
              <EmptyState icon={Scale} title="No job cards yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-2.5 font-medium">Job</th>
                      <th className="px-5 py-2.5 font-medium">Karigar</th>
                      <th className="px-5 py-2.5 text-right font-medium">Issued</th>
                      <th className="px-5 py-2.5 text-right font-medium">Received</th>
                      <th className="px-5 py-2.5 text-right font-medium">Wastage</th>
                      <th className="px-5 py-2.5 text-right font-medium">Labour</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
                  <tbody className="divide-y divide-border/70">
                    {data.jobs.map((j) => (
                      <tr key={j._id} className="transition-colors hover:bg-muted/40">
                        <td className="px-5 py-3">
                          <p className="text-[13px]">{j.description}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDate(j.issuedAt)}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-xs">
                          {j.karigar?.name ?? "—"}
                        </td>
                        <td className="nums px-5 py-3 text-right text-xs">
                          {j.issuedWeight.toFixed(2)} g
                          <span className="block text-[11px] text-muted-foreground">
                            {PURITY_LABELS[j.issuedPurity as number] ?? j.issuedPurity}
                          </span>
                        </td>
                        <td className="nums px-5 py-3 text-right text-xs">
                          {j.receivedWeight != null ? (
                            <>
                              {j.receivedWeight.toFixed(2)} g
                              <span className="block text-[11px] text-muted-foreground">
                                {PURITY_LABELS[j.receivedPurity as number] ?? "—"}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Pending</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right text-xs">
                          {j.wastage ? (
                            <>
                              <span
                                className={`nums font-semibold ${
                                  j.wastage.withinAllowance
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-destructive"
                                }`}
                              >
                                {j.wastage.wastagePct}%
                              </span>
                              <span className="block text-[11px] text-muted-foreground">
                                {j.wastage.wastageGrams.toFixed(3)} g · allow{" "}
                                {j.allowedWastagePct}%
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right text-xs">
                          <Money value={j.laborCharge} />
                        </td>
                        <td className="px-5 py-3">
                          <Pill tone={j.status === "RECEIVED" ? "safe" : "warn"}>
                            {j.status}
                          </Pill>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {j.status === "ISSUED" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setReceiving(j._id)}
                            >
                              <PackageCheck className="size-3.5" />
                              Receive
                            </Button>
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
      )}
    </div>
  );
}

function IssuePanel({
  karigars,
  onClose,
  onSubmit,
}: {
  karigars: { _id: Id<"karigars">; name: string }[];
  onClose: () => void;
  onSubmit: (args: {
    karigarId: Id<"karigars">;
    description: string;
    issuedWeight: number;
    issuedPurity: 24 | 22 | 18 | 925 | 950;
    allowedWastagePct: number;
    laborCharge: number;
  }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    karigarId: (karigars[0]?._id ?? "") as Id<"karigars">,
    description: "",
    issuedWeight: 0,
    issuedPurity: 22 as number,
    allowedWastagePct: 2.5,
    laborCharge: 0,
  });

  const field = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm nums";
  const label = "text-[10px] uppercase tracking-wider text-muted-foreground";

  return (
    <Panel
      title="Issue fine metal against a job card"
      action={
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      }
    >
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block lg:col-span-3">
          <span className={label}>Job description</span>
          <input
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="e.g. Bridal necklace set — 120g gross"
          />
        </label>
        <label className="block">
          <span className={label}>Karigar</span>
          <select
            className={`${field} mt-1`}
            value={form.karigarId}
            onChange={(e) =>
              setForm({ ...form, karigarId: e.target.value as Id<"karigars"> })
            }
          >
            {karigars.map((k) => (
              <option key={k._id} value={k._id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Issued weight (g)</span>
          <input
            type="number" step="0.01" min="0"
            className={`${field} mt-1`}
            value={form.issuedWeight}
            onChange={(e) => setForm({ ...form, issuedWeight: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block">
          <span className={label}>Purity</span>
          <select
            className={`${field} mt-1`}
            value={form.issuedPurity}
            onChange={(e) => setForm({ ...form, issuedPurity: Number(e.target.value) })}
          >
            {PURITIES.map((p) => (
              <option key={p} value={p}>
                {PURITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Allowed wastage %</span>
          <input
            type="number" step="0.1" min="0"
            className={`${field} mt-1`}
            value={form.allowedWastagePct}
            onChange={(e) => setForm({ ...form, allowedWastagePct: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block">
          <span className={label}>Agreed labour ₹</span>
          <input
            type="number" step="100" min="0"
            className={`${field} mt-1`}
            value={form.laborCharge}
            onChange={(e) => setForm({ ...form, laborCharge: Number(e.target.value) || 0 })}
          />
        </label>
      </div>

      <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={busy || !form.description || form.issuedWeight <= 0 || !form.karigarId}
          onClick={async () => {
            setBusy(true);
            await onSubmit({
              ...form,
              issuedPurity: form.issuedPurity as 22,
            });
            setBusy(false);
          }}
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Issue metal
        </Button>
      </div>
    </Panel>
  );
}

/**
 * Receive a finished ornament back from the goldsmith.
 *
 * Wastage is previewed live against the *fine* metal issued (not gross weight),
 * so a 22K return is judged fairly. Labour can be re-negotiated at receipt — the
 * agreed figure from the job card is the starting point.
 */
function ReceivePanel({
  job,
  onClose,
  onSubmit,
}: {
  job: {
    _id: Id<"karigarJobs">;
    description: string;
    issuedWeight: number;
    issuedPurity: number;
    allowedWastagePct: number;
    laborCharge: number;
    karigar: { name: string } | null;
  };
  onClose: () => void;
  onSubmit: (args: {
    jobId: Id<"karigarJobs">;
    receivedWeight: number;
    receivedPurity: 24 | 22 | 18 | 925 | 950;
    laborCharge?: number;
  }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    receivedWeight: job.issuedWeight,
    receivedPurity: job.issuedPurity as number,
    laborCharge: job.laborCharge,
  });

  const preview = useMemo(
    () =>
      computeWastage({
        issuedWeight: job.issuedWeight,
        issuedPurity: job.issuedPurity,
        receivedWeight: form.receivedWeight || 0,
        receivedPurity: form.receivedPurity,
        allowedWastagePct: job.allowedWastagePct,
      }),
    [job, form.receivedWeight, form.receivedPurity],
  );

  const field = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm nums";
  const label = "text-[10px] uppercase tracking-wider text-muted-foreground";

  return (
    <Panel
      title="Receive finished work"
      description={`${job.description} · ${job.karigar?.name ?? "Karigar"} · ${job.issuedWeight.toFixed(3)}g @ ${PURITY_LABELS[job.issuedPurity] ?? job.issuedPurity}`}
      action={
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      }
    >
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
        <label className="block">
          <span className={label}>Returned gross weight (g)</span>
          <input
            type="number"
            step="0.001"
            min="0"
            className={`${field} mt-1`}
            value={form.receivedWeight}
            onChange={(e) =>
              setForm({ ...form, receivedWeight: Number(e.target.value) || 0 })
            }
          />
        </label>
        <label className="block">
          <span className={label}>Returned purity</span>
          <select
            className={`${field} mt-1`}
            value={form.receivedPurity}
            onChange={(e) =>
              setForm({ ...form, receivedPurity: Number(e.target.value) })
            }
          >
            {PURITIES.map((p) => (
              <option key={p} value={p}>
                {PURITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Final labour ₹</span>
          <input
            type="number"
            step="100"
            min="0"
            className={`${field} mt-1`}
            value={form.laborCharge}
            onChange={(e) =>
              setForm({ ...form, laborCharge: Number(e.target.value) || 0 })
            }
          />
        </label>
      </div>

      {/* Fine-metal reconciliation — the only number that decides wastage. */}
      <div className="grid gap-2 border-t border-border/70 px-5 py-3 text-xs sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">Fine issued</p>
          <p className="nums mt-0.5 font-semibold">
            {preview.expectedFineMetal.toFixed(3)} g
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Fine received</p>
          <p className="nums mt-0.5 font-semibold">
            {preview.actualFineMetal.toFixed(3)} g
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Wastage</p>
          <p
            className={`nums mt-0.5 font-semibold ${
              preview.withinAllowance
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-destructive"
            }`}
          >
            {preview.wastagePct}% · {preview.wastageGrams.toFixed(3)} g
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Against allowance</p>
          <p className="mt-0.5">
            {preview.withinAllowance ? (
              <Pill tone="safe">Within {job.allowedWastagePct}%</Pill>
            ) : (
              <Pill tone="crit">Over by {preview.excessGrams.toFixed(3)} g</Pill>
            )}
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={busy || form.receivedWeight <= 0}
          onClick={async () => {
            setBusy(true);
            await onSubmit({
              jobId: job._id,
              receivedWeight: form.receivedWeight,
              receivedPurity: form.receivedPurity as 24,
              laborCharge: form.laborCharge,
            });
            setBusy(false);
          }}
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          <PackageCheck className="size-3.5" />
          Receive &amp; bill labour
        </Button>
      </div>
    </Panel>
  );
}

/** Pay out a karigar's outstanding labour cash. */
function SettlePanel({
  karigar,
  onClose,
  onSubmit,
}: {
  karigar: { _id: Id<"karigars">; name: string; cashBalance: number };
  onClose: () => void;
  onSubmit: (amount: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(karigar.cashBalance);
  const over = amount > karigar.cashBalance;

  return (
    <Panel
      title={`Settle labour — ${karigar.name}`}
      description={`${formatINR(karigar.cashBalance)} is owed for finished work.`}
      action={
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      }
    >
      <div className="px-5 py-4">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Amount paid ₹
          </span>
          <input
            type="number"
            step="100"
            min="0"
            className="nums mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
          />
        </label>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Balance left after this payment</span>
          <span className="nums font-semibold">
            {formatINR(Math.max(0, karigar.cashBalance - amount))}
          </span>
        </div>
        {over && <p className="mt-2 text-xs text-destructive">This is more than the labour balance owed.</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={busy || amount <= 0 || over}
          onClick={async () => {
            setBusy(true);
            await onSubmit(amount);
            setBusy(false);
          }}
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          <BanknoteArrowUp className="size-3.5" />
          Pay {formatINR(amount)}
        </Button>
      </div>
    </Panel>
  );
}
