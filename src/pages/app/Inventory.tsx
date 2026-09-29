import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/components/app/AppShell";
import { TagPrint } from "@/components/app/TagPrint";
import { EmptyState, Money, PageHeader, Panel, Pill, Stat } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CATEGORY_LABELS,
  computeNetWeight,
  formatGrams,
  formatINR,
  METAL_LABELS,
  PURITY_LABELS,
} from "@/lib/gehnacloud";
import { useMutation, useQuery } from "convex/react";
import {
  Boxes,
  Loader2,
  Plus,
  QrCode,
  ScanLine,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const CATEGORIES = Object.keys(CATEGORY_LABELS);
const PURITIES = [24, 22, 18, 14, 925, 950];
const METALS = ["GOLD", "SILVER", "PLATINUM"] as const;

const STATUS_TONE: Record<string, "safe" | "warn" | "info" | "neutral"> = {
  IN_STOCK: "safe",
  SOLD: "neutral",
  PLEDGED_GIRVI: "warn",
  AUDITED: "info",
};

export default function Inventory() {
  const { role, tenant } = useWorkspace();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [showAdd, setShowAdd] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [tagFor, setTagFor] = useState<string[] | null>(null);

  const canAdd = role === "STORE_OWNER" || role === "ACCOUNTANT";
  const data = useQuery(api.inventory.list, { search, status, category });
  const addItem = useMutation(api.inventory.add);
  const rapidAudit = useMutation(api.inventory.rapidAudit);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Smart inventory"
        description="Every piece carries a HUID, an RFID tag and a gross-to-net weight trail."
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAudit((s) => !s)}
            >
              <ScanLine className="size-4" />
              RFID audit
            </Button>
            {canAdd && (
              <Button size="sm" onClick={() => setShowAdd((s) => !s)}>
                <Plus className="size-4" />
                Add piece
              </Button>
            )}
          </div>
        }
      />

      {data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Pieces tracked"
            value={data.summary.total}
            sub={`${data.summary.inStock} on shelf · ${data.summary.sold} sold`}
            icon={Boxes}
            tone="gold"
          />
          <Stat
            label="Net weight on hand"
            value={formatGrams(data.summary.netWeight)}
            sub="Excludes sold and pledged"
          />
          <Stat
            label="Pledged to Girvi"
            value={data.summary.pledged}
            sub="Held as collateral"
            tone={data.summary.pledged > 0 ? "warn" : "neutral"}
          />
          <Stat
            label="Stock value"
            value={formatINR(data.summary.stockValue)}
            sub="At purchase rate"
          />
        </div>
      )}

      {showAudit && (
        <RapidAuditPanel
          onRun={async (tags) => {
            try {
              const res = await rapidAudit({ scannedTags: tags });
              toast.success(
                `${res.matched.length} reconciled · ${res.missing.length} unaccounted`,
              );
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Audit failed");
            }
          }}
          onClose={() => setShowAudit(false)}
        />
      )}

      {showAdd && canAdd && (          <AddItemPanel
            data={data}
            onClose={() => setShowAdd(false)}            onSubmit={async (args) => {
            try {
              await addItem(args);
              toast.success("Added to stock with a fresh HUID and RFID tag.");
              setShowAdd(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not add piece");
            }
          }}
        />
      )}

      {tagFor && (
        <Panel>
          <TagPrint
            items={data?.items.filter((i) => tagFor.includes(i._id)) ?? []}
            businessName={tenant.businessName}
            gstin={tenant.gstin}
            onClose={() => setTagFor(null)}
          />
        </Panel>
      )}

      <Panel
        title="Stock book"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={selected.size === 0}
              onClick={() => setTagFor([...selected])}
            >
              <TagIcon className="size-3.5" />
              Print tags ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={selected.size === 0}
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>

            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, barcode, HUID…"
              className="h-8 w-44 text-xs"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, barcode, HUID…"
              className="h-8 w-52 text-xs"
            />
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="ALL">All statuses</option>
              <option value="IN_STOCK">In stock</option>
              <option value="SOLD">Sold</option>
              <option value="PLEDGED_GIRVI">Pledged</option>
              <option value="AUDITED">Audited</option>
            </select>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="ALL">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {!data || data.items.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No pieces match"
            hint="Loosen the filters, or add the first piece to this workspace."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="w-9 px-3 py-2.5" />
                  <th className="px-5 py-2.5 font-medium">Piece</th>
                  <th className="px-5 py-2.5 font-medium">HUID / RFID</th>
                  <th className="px-5 py-2.5 font-medium">Metal</th>
                  <th className="px-5 py-2.5 text-right font-medium">Gross</th>
                  <th className="px-5 py-2.5 text-right font-medium">Stones</th>
                  <th className="px-5 py-2.5 text-right font-medium">Net</th>
                  <th className="px-5 py-2.5 text-right font-medium">Rate</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {data.items.map((it) => (
                  <tr key={it._id} className="transition-colors hover:bg-muted/40">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={selected.has(it._id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(it._id);
                          else next.delete(it._id);
                          setSelected(next);
                        }}
                        aria-label={`Select ${it.itemName}`}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{it.itemName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {CATEGORY_LABELS[it.category] ?? it.category} ·{" "}
                        <span className="font-mono">{it.barcode}</span>
                      </p>
                      {it.gemstoneType && (
                        <p className="text-[11px] text-primary">
                          {it.gemstoneCarat}ct {it.gemstoneType}
                          {it.gemstoneClarity ? ` · ${it.gemstoneClarity}` : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-mono text-xs">{it.huidNumber}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {it.rfidTag ?? "—"}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {METAL_LABELS[it.metalType]}
                      <span className="block text-muted-foreground">
                        {PURITY_LABELS[it.purityKarat as number] ?? it.purityKarat}
                      </span>
                    </td>
                    <td className="nums px-5 py-3 text-right text-xs">
                      {it.grossWeight.toFixed(3)} g
                    </td>
                    <td className="nums px-5 py-3 text-right text-xs text-muted-foreground">
                      {it.stoneWeight > 0 ? `${it.stoneWeight.toFixed(3)} g` : "—"}
                    </td>
                    <td className="nums px-5 py-3 text-right text-xs font-semibold text-primary">
                      {it.netWeight.toFixed(3)} g
                    </td>
                    <td className="px-5 py-3 text-right text-xs">
                      <Money value={it.purchaseRate} />
                    </td>
                    <td className="px-5 py-3">
                      <Pill tone={STATUS_TONE[it.status] ?? "neutral"}>
                        {it.status.replace(/_/g, " ")}
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

function AddItemPanel({
  data,
  onClose,
  onSubmit,
}: {
  data: { categories: string[]; gemstones: readonly string[]; clarities: readonly string[] } | undefined;
  onClose: () => void;
  onSubmit: (args: {
    itemName: string;
    category: string;
    metalType: "GOLD" | "SILVER" | "PLATINUM";
    purityKarat: 24 | 22 | 18 | 14 | 925 | 950;
    grossWeight: number;
    stoneWeight: number;
    enamelWeight: number;
    makingChargePerGram: number;
    purchaseRate: number;
    gemstoneType?: string;
    gemstoneCarat?: number;
    gemstoneClarity?: string;
    gemstoneRatePerCarat?: number;
  }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    itemName: "",
    category: "NECKLACE",
    metalType: "GOLD" as "GOLD" | "SILVER" | "PLATINUM",
    purityKarat: 22 as number,
    grossWeight: 0,
    stoneWeight: 0,
    enamelWeight: 0,
    makingChargePerGram: 0,
    purchaseRate: 0,
    gemstoneType: "" as string,
    gemstoneCarat: 0,
    gemstoneClarity: "" as string,
    gemstoneRatePerCarat: 0,
  });

  const { netWeight } = computeNetWeight(form);

  const field =
    "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm nums";
  const label = "text-[10px] uppercase tracking-wider text-muted-foreground";

  return (
    <Panel
      title="Add a piece to stock"
      description="Net weight is derived here — the server never trusts a client total."
      action={
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      }
    >
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block lg:col-span-2">
          <span className={label}>Item name</span>
          <Input
            className="mt-1 h-9 text-sm"
            value={form.itemName}
            onChange={(e) => setForm({ ...form, itemName: e.target.value })}
            placeholder="e.g. Kundan Polki Necklace"
          />
        </label>
        <label className="block">
          <span className={label}>Category</span>
          <select
            className={`${field} mt-1`}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
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
            onChange={(e) =>
              setForm({ ...form, purityKarat: Number(e.target.value) })
            }
          >
            {PURITIES.map((p) => (
              <option key={p} value={p}>
                {PURITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["Gross weight (g)", "grossWeight"],
            ["Stone weight (g)", "stoneWeight"],
            ["Enamel/thread (g)", "enamelWeight"],
            ["Making ₹/g", "makingChargePerGram"],
            ["Purchase ₹/g", "purchaseRate"],
          ] as const
        ).map(([l, key]) => (
          <label key={key} className="block">
            <span className={label}>{l}</span>
            <input
              type="number"
              step="0.001"
              min="0"
              className={`${field} mt-1`}
              value={form[key]}
              onChange={(e) =>
                setForm({ ...form, [key]: Number(e.target.value) || 0 })
              }
            />
          </label>
        ))}
        <div className="rounded-md bg-muted px-3 py-2">
          <span className={label}>Net weight</span>
          <p className="nums mt-0.5 text-sm font-semibold text-primary">
            {netWeight.toFixed(3)} g
          </p>
        </div>

        <label className="block">
          <span className={label}>Gemstone</span>
          <select
            className={`${field} mt-1`}
            value={form.gemstoneType}
            onChange={(e) => setForm({ ...form, gemstoneType: e.target.value })}
          >
            <option value="">None</option>
            {(data?.gemstones ?? []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        {form.gemstoneType && (
          <>
            <label className="block">
              <span className={label}>Carat</span>
              <input
                type="number" step="0.01" min="0"
                className={`${field} mt-1`}
                value={form.gemstoneCarat}
                onChange={(e) =>
                  setForm({ ...form, gemstoneCarat: Number(e.target.value) || 0 })
                }
              />
            </label>
            <label className="block">
              <span className={label}>Clarity</span>
              <select
                className={`${field} mt-1`}
                value={form.gemstoneClarity}
                onChange={(e) => setForm({ ...form, gemstoneClarity: e.target.value })}
              >
                <option value="">—</option>
                {(data?.clarities ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>₹/carat</span>
              <input
                type="number" step="100" min="0"
                className={`${field} mt-1`}
                value={form.gemstoneRatePerCarat}
                onChange={(e) =>
                  setForm({ ...form, gemstoneRatePerCarat: Number(e.target.value) || 0 })
                }
              />
            </label>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={busy || !form.itemName || form.grossWeight <= 0}
          onClick={async () => {
            setBusy(true);
            await onSubmit({
              ...form,
              purityKarat: form.purityKarat as 24 | 22 | 18 | 14 | 925 | 950,
            });
            setBusy(false);
          }}
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Add to stock
        </Button>
      </div>
    </Panel>
  );
}

function RapidAuditPanel({
  onRun,
  onClose,
}: {
  onRun: (tags: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Panel
      title="RFID rapid audit"
      description="Paste the tag stream a handheld scanner emitted — one tag per line or comma separated."
      action={
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      }
    >
      <div className="space-y-3 px-5 py-4">
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={3}
          placeholder="RFID-70003, RFID-70006, RFID-70009…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            disabled={busy || !raw.trim()}
            onClick={async () => {
              setBusy(true);
              await onRun(
                raw
                  .split(/[\s,]+/)
                  .map((t) => t.trim())
                  .filter(Boolean),
              );
              setBusy(false);
            }}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <QrCode className="size-3.5" />}
            Reconcile
          </Button>
          <p className="text-xs text-muted-foreground">
            Matched pieces are stamped AUDITED; anything unaccounted is flagged for the
            closing audit.
          </p>
        </div>
      </div>
    </Panel>
  );
}
