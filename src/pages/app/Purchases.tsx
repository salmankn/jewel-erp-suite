import { api } from "@/convex/_generated/api";
import { EmptyState, Money, PageHeader, Panel, Pill, Stat } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import {
  computeNetWeight,
  formatDate,
  formatGrams,
  formatINR,
  METAL_LABELS,
  PURITY_LABELS,
} from "@/lib/gehnacloud";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus, Receipt, ShieldAlert, TrendingDown, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PURITIES = [24, 22, 18, 925, 950];
const METALS = ["GOLD", "SILVER", "PLATINUM"] as const;

/**
 * Module 3 — inward supplies.
 *
 * A jeweller buys from two very different counterparties: registered dealers
 * (recoverable GST) and unregistered dealers who sell old gold at a counter
 * (URD — tax paid, no credit). Both land here.
 */
export default function Purchases() {
  const [showAdd, setShowAdd] = useState(false);
  const data = useQuery(api.purchases.list, {});
  const inward = useQuery(api.purchases.inwardSummary, {});
  const create = useMutation(api.purchases.create);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Purchase register"
        description="URD and registered-dealer metal purchases, with input tax credit for GSTR-3B."
        action={
          <Button size="sm" onClick={() => setShowAdd((s) => !s)}>
            {showAdd ? <X className="size-4" /> : <Plus className="size-4" />}
            {showAdd ? "Cancel" : "Record purchase"}
          </Button>
        }
      />

      {showAdd && (
        <Panel
          title="Record a purchase"
          description="Section 17(5): no input credit on an unregistered dealer purchase."
        >
          <PurchaseForm
            onClose={() => setShowAdd(false)}
            onSubmit={async (args) => {
              try {
                const res = await create(args);
                toast.success(
                  `${res.purchaseNumber} recorded · ₹${formatINR(res.total)}${
                    res.itcClaimable > 0 ? ` · ITC ₹${formatINR(res.itcClaimable)}` : " · no ITC"
                  }`,
                );
                setShowAdd(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not record");
              }
            }}
          />
        </Panel>
      )}

      {data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            index={0}
            label="Total spend"
            value={formatINR(data.summary.totalSpend)}
            sub={`${data.summary.count} purchases`}
            icon={Receipt}
            tone="gold"
          />
          <Stat
            index={1}
            label="URD spend"
            value={formatINR(data.summary.urdSpend)}
            sub={`${data.summary.urdCount} unregistered dealers`}
            tone={data.summary.urdCount > 0 ? "warn" : "neutral"}
          />
          <Stat
            index={2}
            label="ITC recoverable"
            value={formatINR(data.summary.itcClaimable)}
            sub="Claim against output GST"
            icon={TrendingDown}
          />
          <Stat
            index={3}
            label="Metal received"
            value={formatGrams(data.summary.metalReceived)}
            sub="Net of stones"
          />
        </div>
      )}

      {inward && (
        <Panel
          title="GSTR-3B inward supplies (Table 4)"
          description="Split between registered suppliers and unregistered dealers."
        >
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                B2B — registered suppliers
              </p>
              <p className="nums mt-1.5 text-lg font-semibold">
                {formatINR(inward.table4.b2b.taxableValue)}
              </p>
              <p className="text-xs text-muted-foreground">
                ITC claimable{" "}
                <strong className="nums text-emerald-600 dark:text-emerald-400">
                  {formatINR(inward.table4.b2b.itc)}
                </strong>
              </p>
            </div>
            <div className="rounded-lg border border-border/70 p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <ShieldAlert className="size-3" />
                URD — unregistered dealers
              </p>
              <p className="nums mt-1.5 text-lg font-semibold">
                {formatINR(inward.table4.urd.taxableValue)}
              </p>
              <p className="text-xs text-muted-foreground">
                Tax paid{" "}
                <strong className="nums text-amber-600 dark:text-amber-400">
                  {formatINR(inward.table4.urd.taxPaid)}
                </strong>{" "}
                · ITC nil
              </p>
            </div>
          </div>

          {Object.keys(inward.byGstin).length > 0 && (
            <div className="border-t border-border/70 px-5 py-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Supplier-wise ITC
              </p>
              <ul className="space-y-1.5">
                {Object.entries(inward.byGstin).map(([gstin, row]) => (
                  <li key={gstin} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0">
                      <span className="font-mono">{gstin}</span>
                      <span className="ml-2 text-muted-foreground">{row.name}</span>
                    </span>
                    <span className="nums shrink-0 text-muted-foreground">
                      {formatINR(row.taxable)} · ITC {formatINR(row.itc)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}

      <Panel title="Purchase book">
        {!data || data.purchases.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No purchases recorded"
            hint="Record metal bought from dealers and URD counters to unlock input credit."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Purchase</th>
                  <th className="px-5 py-2.5 font-medium">Supplier</th>
                  <th className="px-5 py-2.5 text-right font-medium">Net weight</th>
                  <th className="px-5 py-2.5 text-right font-medium">Value</th>
                  <th className="px-5 py-2.5 text-right font-medium">GST</th>
                  <th className="px-5 py-2.5 text-right font-medium">ITC</th>
                  <th className="px-5 py-2.5 font-medium">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {data.purchases.map((p) => (
                  <tr key={p._id} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <p className="font-mono text-xs font-medium">{p.purchaseNumber}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDate(p.createdAt)} · {p.mode}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-[13px]">{p.supplierName}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {p.supplierGstin ?? `Bill ${p.billNumber ?? "—"}`}
                      </p>
                    </td>
                    <td className="nums px-5 py-3 text-right text-xs">
                      {p.netWeight.toFixed(3)} g
                      <span className="block text-[11px] text-muted-foreground">
                        {METAL_LABELS[p.metalType]} {PURITY_LABELS[p.purityKarat] ?? p.purityKarat}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-xs">
                      <Money value={p.total} />
                      <span className="block text-[11px] text-muted-foreground">
                        now {formatINR(p.metalValueNow)}
                      </span>
                    </td>
                    <td className="nums px-5 py-3 text-right text-xs text-muted-foreground">
                      {formatINR(p.cgst + p.sgst + p.igst)}
                    </td>
                    <td className="px-5 py-3 text-right text-xs">
                      {p.itcClaimable > 0 ? (
                        <span className="nums font-medium text-emerald-600 dark:text-emerald-400">
                          {formatINR(p.itcClaimable)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Pill tone={p.isUrd ? "warn" : "safe"}>
                        {p.isUrd ? "URD" : "Registered"}
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
  );
}

function PurchaseForm({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (args: {
    supplierName: string;
    supplierGstin?: string;
    isUrd: boolean;
    billNumber?: string;
    metalType: "GOLD" | "SILVER" | "PLATINUM";
    purityKarat: 24 | 22 | 18 | 925 | 950;
    grossWeight: number;
    stoneWeight: number;
    taxableValue: number;
    interState: boolean;
    mode: "CASH" | "UPI" | "BANK";
  }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    supplierName: "",
    supplierGstin: "",
    isUrd: false,
    billNumber: "",
    metalType: "GOLD" as "GOLD" | "SILVER" | "PLATINUM",
    purityKarat: 22 as number,
    grossWeight: 0,
    stoneWeight: 0,
    taxableValue: 0,
    interState: false,
    mode: "CASH" as "CASH" | "UPI" | "BANK",
  });

  const { netWeight } = computeNetWeight(form);
  const gst = (form.taxableValue * 3) / 100;

  const field = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm nums";
  const label = "text-[10px] uppercase tracking-wider text-muted-foreground";

  return (
    <>
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block lg:col-span-2">
          <span className={label}>Supplier name</span>
          <input
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
            value={form.supplierName}
            onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
            placeholder="e.g. Bullion Dealers LLP"
          />
        </label>
        <label className="block">
          <span className={label}>GSTIN</span>
          <input
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm uppercase"
            value={form.supplierGstin}
            onChange={(e) => setForm({ ...form, supplierGstin: e.target.value })}
            placeholder="08ABCDE1234F1Z5"
            disabled={form.isUrd}
          />
        </label>
        <label className="block">
          <span className={label}>Bill / counterfoil no.</span>
          <input
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
            value={form.billNumber}
            onChange={(e) => setForm({ ...form, billNumber: e.target.value })}
            placeholder={form.isUrd ? "Required for URD" : "Optional"}
          />
        </label>

        <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-xs text-muted-foreground lg:col-span-4">
          <input
            type="checkbox"
            checked={form.isUrd}
            onChange={(e) => setForm({ ...form, isUrd: e.target.checked })}
            className="accent-primary"
          />
          Unregistered dealer (URD) — 3% is levied but no input tax credit is available
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
          <span className={label}>Net weight (g)</span>
          <p className="nums mt-1 h-9 rounded-md bg-muted px-2.5 py-1.5 text-sm font-semibold text-primary">
            {netWeight.toFixed(3)} g
          </p>
        </label>

        <label className="block">
          <span className={label}>Purchase value (pre-tax) ₹</span>
          <input
            type="number" step="100" min="0"
            className={`${field} mt-1`}
            value={form.taxableValue}
            onChange={(e) => setForm({ ...form, taxableValue: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block">
          <span className={label}>Mode</span>
          <select
            className={`${field} mt-1`}
            value={form.mode}
            onChange={(e) => setForm({ ...form, mode: e.target.value as typeof form.mode })}
          >
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="BANK">Bank transfer</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={form.interState}
            onChange={(e) => setForm({ ...form, interState: e.target.checked })}
            className="accent-primary"
          />
          Inter-state (IGST)
        </label>
        <div className="rounded-md bg-muted px-3 py-2">
          <span className={label}>Total payable</span>
          <p className="nums mt-0.5 text-sm font-semibold text-primary">
            {formatINR(form.taxableValue + gst)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            GST {formatINR(gst)} · ITC{" "}
            {form.isUrd ? "nil (URD)" : formatINR(gst)}
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={busy || !form.supplierName || form.taxableValue <= 0}
          onClick={async () => {
            setBusy(true);
            await onSubmit({
              ...form,
              supplierGstin: form.supplierGstin || undefined,
              billNumber: form.billNumber || undefined,
              purityKarat: form.purityKarat as 22,
            });
            setBusy(false);
          }}
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Record purchase
        </Button>
      </div>
    </>
  );
}
