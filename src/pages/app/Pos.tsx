import { api } from "@/convex/_generated/api";
import { EmptyState, PageHeader, Panel, Pill } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  computeGst,
  computeNetWeight,
  formatGrams,
  formatINR,
  priceLine,
  validateSplits,
} from "@/lib/gehnacloud";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Check,
  Loader2,
  Minus,
  Plus,
  Receipt,
  Send,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const PURITIES = [
  { value: 24, label: "24K / 999" },
  { value: 22, label: "22K / 916" },
  { value: 18, label: "18K / 750" },
  { value: 14, label: "14K / 585" },
  { value: 925, label: "925 Silver" },
  { value: 950, label: "950 Silver" },
];

const MODES = ["CASH", "UPI", "CARD", "BANK", "OLD_GOLD"];

const GEMSTONES = [
  "DIAMOND",
  "RUBY",
  "EMERALD",
  "SAPPHIRE",
  "PEARL",
  "AMETHYST",
  "TANZANITE",
] as const;

interface DraftLine {
  key: string;
  itemId?: Id<"inventoryItems">;
  itemName: string;
  description: string;
  huidNumber: string;
  purityKarat: number;
  grossWeight: number;
  stoneWeight: number;
  enamelWeight: number;
  makingChargePerGram: number;
  stoneValue: number;
  discountPct: number;
  gemstoneType?: string;
  gemstoneCarat?: number;
  gemstoneRatePerCarat?: number;
}

function blankLine(): DraftLine {
  return {
    key: Math.random().toString(36).slice(2),
    itemName: "",
    description: "",
    huidNumber: "",
    purityKarat: 22,
    grossWeight: 0,
    stoneWeight: 0,
    enamelWeight: 0,
    makingChargePerGram: 0,
    stoneValue: 0,
    discountPct: 0,
  };
}

export default function Pos() {
  const rates = useQuery(api.rates.board);
  const inventory = useQuery(api.inventory.list, { status: "IN_STOCK" });
  const customers = useQuery(api.customers.list, {});
  const createInvoice = useMutation(api.billing.createInvoice);

  const [customerId, setCustomerId] = useState<Id<"customers"> | "">("");
  const [customerName, setCustomerName] = useState("");
  const [gstin, setGstin] = useState("");
  const [interState, setInterState] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [splits, setSplits] = useState([{ mode: "CASH", amount: 0 }]);
  const [submitting, setSubmitting] = useState(false);

  const rateFor = (purity: number) =>
    rates?.find((r) => r.purityKarat === purity && r.metalType !== "PLATINUM")
      ?.ratePerGram ?? 0;

  /** Price every line from the live board — same maths the server will run. */
  const priced = useMemo(
    () =>
      lines.map((l) => {
        const { netWeight } = computeNetWeight({
          grossWeight: l.grossWeight,
          stoneWeight: l.stoneWeight,
          enamelWeight: l.enamelWeight,
        });
        const ratePerGram = rateFor(l.purityKarat);
        const breakdown = priceLine({
          netWeight,
          ratePerGram,
          makingChargePerGram: l.makingChargePerGram,
          stoneValue: l.stoneValue,
          discountPct: l.discountPct,
        });
        return { line: l, netWeight, ratePerGram, breakdown };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, rates],
  );

  const taxableValue = priced.reduce((a, p) => a + p.breakdown.amount, 0);
  const gst = computeGst(taxableValue, interState);
  const splitCheck = validateSplits(splits, gst.total);

  const update = (key: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const addFromStock = (itemId: string) => {
    const item = inventory?.items.find((i) => i._id === itemId);
    if (!item) return;
    setLines((prev) => [
      ...prev.filter((l) => l.itemName || l.grossWeight > 0),
      {
        ...blankLine(),
        itemId: item._id,
        itemName: item.itemName,
        description: `${item.category.replace(/_/g, " ").toLowerCase()} · HUID ${item.huidNumber}`,
        huidNumber: item.huidNumber,
        purityKarat: item.purityKarat as number,
        // Seed gross from the book, then let staff correct stones.
        grossWeight: item.grossWeight,
        stoneWeight: item.stoneWeight,
        makingChargePerGram: item.makingChargePerGram,
      },
    ]);
  };

  const patchSplit = (i: number, patch: Partial<{ mode: string; amount: number }>) =>
    setSplits((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const reset = () => {
    setLines([blankLine()]);
    setSplits([{ mode: "CASH", amount: 0 }]);
    setCustomerId("");
    setCustomerName("");
    setGstin("");
  };

  const submit = async () => {
    const usable = priced.filter((p) => p.line.itemName && p.line.grossWeight > 0);
    if (usable.length === 0) return toast.error("Add at least one item to bill.");
    if (!customerName.trim()) return toast.error("Enter the customer's name.");
    if (gstin.trim() && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{2}$/.test(gstin.trim())) {
      return toast.error("That GSTIN does not look valid — 15 characters.");
    }
    if (!splitCheck.ok) return toast.error(splitCheck.message ?? "Check the settlement.");

    setSubmitting(true);
    try {
      const result = await createInvoice({
        customerId: customerId || undefined,
        customerName: customerName.trim(),
        gstin: gstin.trim() || undefined,
        interState,
        lines: usable.map((p) => ({
          itemId: p.line.itemId,
          itemName: p.line.itemName,
          description: p.line.description,
          huidNumber: p.line.huidNumber,
          purityKarat: p.line.purityKarat,
          netWeight: p.netWeight,
          makingChargePerGram: p.line.makingChargePerGram,
          stoneValue: p.line.stoneValue,
          discountPct: p.line.discountPct,
        })),
        splits: splits
          .filter((s) => s.amount > 0)
          .map((s) => ({ mode: s.mode, amount: s.amount })),
      });

      toast.success(`${result.invoiceNumber} issued · ${formatINR(result.total)}`);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not issue the invoice.");
    } finally {
      setSubmitting(false);
    }
  };

  const numberField =
    "h-9 rounded-md border border-input bg-background px-2.5 text-sm nums focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Billing counter"
        description="Rates flow from the live metal board. HUID is mandatory on every jewellery line — 3% GST applies."
      />

      <div className="grid gap-5 lg:grid-cols-5">
        {/* ── cart ── */}
        <div className="space-y-5 lg:col-span-3">
          <Panel
            title="Line items"
            description="Pick from stock to auto-fill HUID and weights, or key a loose piece by hand."
            action={
              <div className="flex gap-2">
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value=""
                  onChange={(e) => e.target.value && addFromStock(e.target.value)}
                >
                  <option value="">Add from stock…</option>
                  {(inventory?.items ?? []).map((i) => (
                    <option key={i._id} value={i._id}>
                      {i.itemName} · {formatGrams(i.netWeight)}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLines((p) => [...p, blankLine()])}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            }
          >
            <div className="divide-y divide-border/70">
              {priced.map(({ line, netWeight, ratePerGram, breakdown }) => (
                <div key={line.key} className="space-y-3 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="grid flex-1 gap-3 sm:grid-cols-2">
                      <Input
                        value={line.itemName}
                        onChange={(e) => update(line.key, { itemName: e.target.value })}
                        placeholder="Item name"
                        className="h-9 text-sm"
                      />
                      <Input
                        value={line.huidNumber}
                        onChange={(e) => update(line.key, { huidNumber: e.target.value })}
                        placeholder="HUID (6 digits)"
                        className={`h-9 font-mono text-sm ${
                          line.huidNumber && !/^\d{6}$/.test(line.huidNumber)
                            ? "border-destructive"
                            : ""
                        }`}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0"
                      onClick={() =>
                        setLines((p) => p.filter((l) => l.key !== line.key))
                      }
                      aria-label="Remove line"
                    >
                      <Trash2 className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-end gap-2.5">
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Purity
                      </span>
                      <select
                        className={`${numberField} mt-1 block`}
                        value={line.purityKarat}
                        onChange={(e) =>
                          update(line.key, { purityKarat: Number(e.target.value) })
                        }
                      >
                        {PURITIES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {(
                      [
                        ["Gross g", "grossWeight"],
                        ["Stone g", "stoneWeight"],
                        ["Enamel g", "enamelWeight"],
                      ] as const
                    ).map(([label, field]) => (
                      <label key={field} className="block">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {label}
                        </span>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          className={`${numberField} mt-1 block w-24`}
                          value={line[field]}
                          onChange={(e) =>
                            update(line.key, { [field]: Number(e.target.value) || 0 })
                          }
                        />
                      </label>
                    ))}

                  <div className="block">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Net weight
                    </span>
                    <p className="nums mt-1 h-9 rounded-md bg-muted px-2.5 py-1.5 text-sm font-semibold text-primary">
                      {netWeight.toFixed(3)} g
                    </p>
                  </div>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Stone
                    </span>
                    <select
                      className={`${numberField} mt-1 block w-32`}
                      value={line.gemstoneType ?? ""}
                      onChange={(e) =>
                        update(line.key, {
                          gemstoneType: e.target.value || undefined,
                        })
                      }
                    >
                      <option value="">None</option>
                      {GEMSTONES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </label>

                  {line.gemstoneType && (
                    <>
                      <label className="block">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Carat
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={`${numberField} mt-1 block w-20`}
                          value={line.gemstoneCarat ?? ""}
                          onChange={(e) =>
                            update(line.key, {
                              gemstoneCarat: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          ₹/carat
                        </span>
                        <input
                          type="number"
                          step="100"
                          min="0"
                          className={`${numberField} mt-1 block w-28`}
                          value={line.gemstoneRatePerCarat ?? ""}
                          onChange={(e) =>
                            update(line.key, {
                              gemstoneRatePerCarat: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </label>
                    </>
                  )}

                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Making ₹/g
                      </span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className={`${numberField} mt-1 block w-24`}
                        value={line.makingChargePerGram}
                        onChange={(e) =>
                          update(line.key, {
                            makingChargePerGram: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </label>

                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Stones ₹
                      </span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className={`${numberField} mt-1 block w-24`}
                        value={line.stoneValue}
                        onChange={(e) =>
                          update(line.key, { stoneValue: Number(e.target.value) || 0 })
                        }
                      />
                    </label>

                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Disc %
                      </span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        className={`${numberField} mt-1 block w-20`}
                        value={line.discountPct}
                        onChange={(e) =>
                          update(line.key, { discountPct: Number(e.target.value) || 0 })
                        }
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">
                      Metal {formatINR(breakdown.metalValue)} @ ₹
                      {ratePerGram.toLocaleString("en-IN")}/g
                      {breakdown.makingCharge > 0 &&
                        ` · Making ${formatINR(breakdown.makingCharge)}`}
                      {breakdown.discount > 0 &&
                        ` · Discount −${formatINR(breakdown.discount)}`}
                    </span>
                    <span className="nums text-sm font-semibold">
                      {formatINR(breakdown.amount, true)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* ── settlement ── */}
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Customer">
            <div className="space-y-3 px-5 py-4">
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
                value={customerId}
                onChange={(e) => {
                  const id = e.target.value as Id<"customers"> | "";
                  setCustomerId(id);
                  const c = customers?.customers.find((x) => x._id === id);
                  if (c) {
                    setCustomerName(c.name);
                    // Carry the customer's GSTIN so the GSTR-1 row is valid.
                    setGstin(c.gstin ?? "");
                  }
                }}
              >
                <option value="">Walk-in customer</option>
                {(customers?.customers ?? []).map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} · {c.phone}
                  </option>
                ))}
              </select>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer name"
                className="h-9 text-sm"
              />
              <Input
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="GSTIN (optional, for B2B)"
                maxLength={15}
                className="h-9 font-mono text-sm"
              />
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={interState}
                  onChange={(e) => setInterState(e.target.checked)}
                  className="accent-primary"
                />
                Inter-state sale — charge IGST 3% instead of CGST + SGST
              </label>
            </div>
          </Panel>

          <Panel
            title="GST summary"
            action={
              <Pill tone={interState ? "info" : "gold"}>{interState ? "IGST" : "CGST+SGST"}</Pill>
            }
          >
            <dl className="space-y-2 px-5 py-4 text-sm">
              <Row label="Taxable value" value={formatINR(gst.taxableValue, true)} />
              {interState ? (
                <Row label="IGST @ 3%" value={formatINR(gst.igst, true)} />
              ) : (
                <>
                  <Row label="CGST @ 1.5%" value={formatINR(gst.cgst, true)} />
                  <Row label="SGST @ 1.5%" value={formatINR(gst.sgst, true)} />
                </>
              )}
              <div className="flex items-center justify-between border-t border-border/70 pt-2.5 text-base font-semibold">
                <dt>Grand total</dt>
                <dd className="nums text-primary">{formatINR(gst.total, true)}</dd>
              </div>
            </dl>
          </Panel>

          <Panel
            title="Settlement"
            description="Split across cash, UPI, card, bank or old-gold exchange."
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSplits((p) => [...p, { mode: "UPI", amount: 0 }])
                }
              >
                <Plus className="size-3.5" />
              </Button>
            }
          >
            <div className="space-y-2 px-5 py-4">
              {splits.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className="h-9 flex-1 rounded-md border border-input bg-background px-2.5 text-sm"
                    value={s.mode}
                    onChange={(e) => patchSplit(i, { mode: e.target.value })}
                  >
                    {MODES.map((m) => (
                      <option key={m} value={m}>
                        {m.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className={`${numberField} w-32`}
                    value={s.amount || ""}
                    onChange={(e) => patchSplit(i, { amount: Number(e.target.value) || 0 })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    disabled={splits.length === 1}
                    onClick={() => setSplits((p) => p.filter((_, idx) => idx !== i))}
                    aria-label="Remove split"
                  >
                    <Minus className="size-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}

              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const outstanding = Math.max(0, gst.total - splits.reduce((a, s) => a + s.amount, 0));
                    setSplits((p) => [{ ...p[0], amount: p[0].amount + outstanding }]);
                  }}
                >
                  <Check className="size-3.5" />
                  Balance
                </Button>
                <Pill tone={splitCheck.ok ? "safe" : "warn"}>
                  {splitCheck.ok ? "Reconciled" : splitCheck.message}
                </Pill>
              </div>

              <Button
                className="mt-1 w-full"
                size="lg"
                disabled={submitting || !splitCheck.ok}
                onClick={submit}
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Issue invoice · {formatINR(gst.total)}
              </Button>
            </div>
          </Panel>
        </div>
      </div>

      {!lines.length && (
        <EmptyState icon={Receipt} title="Cart is empty" hint="Add a piece from stock to begin." />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="nums">{value}</dd>
    </div>
  );
}
