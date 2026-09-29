import { api } from "@/convex/_generated/api";
import { EmptyState, Money, PageHeader, Panel, Pill, Stat } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import {
  formatDate,
  formatGrams,
  formatINR,
  PURITY_LABELS,
} from "@/lib/gehnacloud";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { Loader2, Plus, Scale, Wallet, Wrench, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PURITIES = [24, 22, 18, 925, 950];

export default function Karigar() {
  const [showIssue, setShowIssue] = useState(false);
  const data = useQuery(api.karigar.list);
  const issueJob = useMutation(api.karigar.issueJob);

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
            label="Karigars"
            value={data.summary.karigarCount}
            sub={`${data.summary.openJobs} open job cards`}
            icon={Wrench}
            tone="gold"
          />
          <Stat
            label="Metal out with them"
            value={formatGrams(data.summary.metalOut)}
            sub="Issued and not yet returned"
            icon={Scale}
          />
          <Stat
            label="Ghat balance"
            value={formatGrams(data.summary.metalInHand)}
            sub="Pure metal in their custody"
          />
          <Stat
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
                  </div>
                  <div className="mt-2.5 flex gap-5 text-xs">
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
