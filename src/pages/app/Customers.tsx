import { api } from "@/convex/_generated/api";
import { EmptyState, Money, PageHeader, Panel, Pill, Stat } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatGrams, formatINR } from "@/lib/gehnacloud";
import { useMutation, useQuery } from "convex/react";
import {
  BadgeCheck,
  Loader2,
  Plus,
  ShieldQuestion,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Customers() {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const data = useQuery(api.customers.list, { search });
  const addCustomer = useMutation(api.customers.add);
  const kittyPayment = useMutation(api.customers.addKittyPayment);
  const verifyKyc = useMutation(api.customers.verifyKyc);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers & Kitty schemes"
        description="Aadhaar is stored as a last-4 only. Kitty passbooks track monthly gold installments to maturity."
        action={
          <Button size="sm" onClick={() => setShowAdd((s) => !s)}>
            <Plus className="size-4" />
            Add customer
          </Button>
        }
      />

      {data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Customers"
            value={data.summary.total}
            sub={`${data.summary.avgOrder ? formatINR(data.summary.avgOrder) : "—"} average lifetime`}
            icon={Users}
            tone="gold"
          />
          <Stat
            label="Kitty members"
            value={data.summary.kittyMembers}
            sub={`${formatGrams(data.summary.kittyGramsOutstanding)} of gold committed`}
            icon={Wallet}
          />
          <Stat
            label="KYC pending"
            value={data.summary.kycPending}
            sub="Aadhaar OTP or PAN needed"
            tone={data.summary.kycPending > 0 ? "warn" : "safe"}
            icon={ShieldQuestion}
          />
          <Stat
            label="Lifetime value"
            value={formatINR(data.summary.lifetimeValue)}
            sub="Across all bills"
          />
        </div>
      )}

      {showAdd && (
        <AddCustomerPanel
          onClose={() => setShowAdd(false)}
          onSubmit={async (args) => {
            try {
              await addCustomer(args);
              toast.success("Customer added.");
              setShowAdd(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not add customer");
            }
          }}
        />
      )}

      <Panel
        title="Customer book"
        action={
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or phone…"
            className="h-8 w-52 text-xs"
          />
        }
      >
        {!data || data.customers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No customers yet"
            hint="Add your first customer to start a Kitty passbook."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Customer</th>
                  <th className="px-5 py-2.5 font-medium">KYC</th>
                  <th className="px-5 py-2.5 text-right font-medium">Kitty</th>
                  <th className="px-5 py-2.5 text-right font-medium">Months</th>
                  <th className="px-5 py-2.5 text-right font-medium">Passbook value</th>
                  <th className="px-5 py-2.5 text-right font-medium">Lifetime</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {data.customers.map((c) => (
                  <tr key={c._id} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.phone}
                        {c.pan ? ` · ${c.pan}` : ""}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      {c.kycStatus === "VERIFIED" ? (
                        <Pill tone="safe">
                          <BadgeCheck className="size-3" />
                          Verified
                        </Pill>
                      ) : (
                        <Pill tone="warn">
                          Aadhaar ••{c.aadhaarLast4 ?? "————"}
                        </Pill>
                      )}
                    </td>
                    <td className="nums px-5 py-3 text-right text-xs">
                      {c.kittyActive ? `${c.kittyMonthlyGrams} g/mo` : "—"}
                    </td>
                    <td className="nums px-5 py-3 text-right text-xs">
                      {c.kittyActive ? c.kittyPaidMonths : "—"}
                    </td>
                    <td className="px-5 py-3 text-right text-xs">
                      {c.kittyActive ? (
                        <>
                          <Money value={c.kittyValue} />
                          <span className="block text-[11px] text-muted-foreground">
                            {c.kittyGrams.toFixed(3)} g
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-xs">
                      <Money value={c.totalPurchased} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        {c.kycStatus !== "VERIFIED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              try {
                                await verifyKyc({ customerId: c._id });
                                toast.success(`${c.name} verified.`);
                              } catch (e) {
                                toast.error(
                                  e instanceof Error ? e.message : "Could not verify",
                                );
                              }
                            }}
                          >
                            Verify KYC
                          </Button>
                        )}
                        {c.kittyActive && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                const n = await kittyPayment({
                                  customerId: c._id,
                                  amount: Math.round(
                                    c.kittyMonthlyGrams * 90520,
                                  ),
                                });
                                toast.success(
                                  `Installment ${n} recorded for ${c.name}.`,
                                );
                              } catch (e) {
                                toast.error(
                                  e instanceof Error ? e.message : "Could not record",
                                );
                              }
                            }}
                          >
                            + Installment
                          </Button>
                        )}
                      </div>
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

function AddCustomerPanel({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (args: {
    name: string;
    phone: string;
    aadhaarLast4?: string;
    pan?: string;
    kittyActive: boolean;
    kittyMonthlyGrams: number;
  }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    aadhaarLast4: "",
    pan: "",
    kittyActive: false,
    kittyMonthlyGrams: 5,
  });

  const field = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm";
  const label = "text-[10px] uppercase tracking-wider text-muted-foreground";

  return (
    <Panel
      title="Add a customer"
      description="Only the last four Aadhaar digits are ever stored."
      action={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className={label}>Full name</span>
          <input
            className={`${field} mt-1`}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Sunita Sharma"
          />
        </label>
        <label className="block">
          <span className={label}>Phone</span>
          <input
            className={`${field} mt-1`}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+91 98290 00000"
          />
        </label>
        <label className="block">
          <span className={label}>Aadhaar last 4</span>
          <input
            className={`${field} mt-1 nums`}
            maxLength={4}
            value={form.aadhaarLast4}
            onChange={(e) => setForm({ ...form, aadhaarLast4: e.target.value })}
            placeholder="1234"
          />
        </label>
        <label className="block">
          <span className={label}>PAN</span>
          <input
            className={`${field} mt-1 uppercase`}
            value={form.pan}
            onChange={(e) => setForm({ ...form, pan: e.target.value })}
            placeholder="ABCPS1234K"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-xs text-muted-foreground lg:col-span-2">
          <input
            type="checkbox"
            checked={form.kittyActive}
            onChange={(e) => setForm({ ...form, kittyActive: e.target.checked })}
            className="accent-primary"
          />
          Enrol in a monthly gold savings scheme
        </label>
        {form.kittyActive && (
          <label className="block">
            <span className={label}>Grams per month</span>
            <input
              type="number"
              step="0.5"
              min="0"
              className={`${field} mt-1 nums`}
              value={form.kittyMonthlyGrams}
              onChange={(e) =>
                setForm({ ...form, kittyMonthlyGrams: Number(e.target.value) || 0 })
              }
            />
          </label>
        )}
      </div>

      <div className="flex justify-end border-t border-border/70 px-5 py-3">
        <Button
          size="sm"
          disabled={busy || !form.name || !form.phone}
          onClick={async () => {
            setBusy(true);
            await onSubmit({
              ...form,
              aadhaarLast4: form.aadhaarLast4 || undefined,
              pan: form.pan || undefined,
            });
            setBusy(false);
          }}
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Save customer
        </Button>
      </div>
    </Panel>
  );
}
