import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { AuditTrail } from "@/components/app/AuditTrail";
import { EmptyState, Panel, Pill, Stat } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import {
  formatINR,
  METAL_LABELS,
  PURITY_LABELS,
} from "@/lib/gehnacloud";
import { useMutation, useQuery } from "convex/react";
import {
  Boxes,
  Gem,
  KeyRound,
  Loader2,
  LogOut,
  Radio,
  Scale,
  Server,
  ShieldAlert,
  TrendingUp,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

const STATUS_TONE: Record<string, "safe" | "warn" | "crit" | "neutral"> = {
  ACTIVE: "safe",
  TRIAL: "warn",
  SUSPENDED: "crit",
  CHURNED: "neutral",
};

export default function Admin() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const data = useQuery(api.admin.overview, isSuperAdmin ? {} : "skip");
  const updateRate = useMutation(api.rates.updateRate);
  const provisionTenant = useMutation(api.admin.provisionTenant);
  const setTenantStatus = useMutation(api.admin.setTenantStatus);
  const changePlan = useMutation(api.admin.changePlan);

  const [showProvision, setShowProvision] = useState(false);

  if (!isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-xl border border-border/70 bg-card px-6 py-12 text-center">
          <ShieldAlert className="mx-auto size-8 text-primary" />
          <h1 className="mt-4 text-lg font-semibold tracking-tight">
            Platform operators only
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This account is not a GehnaCloud super admin. The Convex server refuses every
            function on this page for non-operators.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/app">Back to my workspace</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Server className="size-4.5" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">
                GehnaCloud <span className="text-primary">Platform</span>
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Super Admin · admin.gehnacloud.com
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/app">
                <Gem className="size-4" />
                Jeweller view
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tenant lifecycle, subscriptions, the global rate board and the audit trail.
            </p>
          </div>
          <Button onClick={() => setShowProvision((s) => !s)}>
            {showProvision ? <X className="size-4" /> : <KeyRound className="size-4" />}
            {showProvision ? "Cancel" : "Onboard a jeweller"}
          </Button>
        </div>

        {showProvision && (
          <ProvisionPanel
            plans={data?.plans ?? []}
            onSubmit={async (args) => {
              try {
                await provisionTenant(args);
                toast.success(`Schema reserved for ${args.businessName}.`);
                setShowProvision(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not onboard");
              }
            }}
          />
        )}

        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Tenants"
                value={data.stats.tenants}
                sub={`${data.stats.active} active · ${data.stats.trials} on trial`}
                icon={Server}
                tone="gold"
              />
              <Stat
                label="Monthly recurring"
                value={formatINR(data.stats.mrr)}
                sub="Active subscriptions"
                icon={TrendingUp}
              />
              <Stat
                label="Items under management"
                value={data.stats.totalItems.toLocaleString("en-IN")}
                sub={`${data.stats.seats} staff seats across all tenants`}
                icon={Boxes}
              />
              <Stat
                label="Open Girvi loans"
                value={data.stats.totalOpenLoans}
                sub="Platform-wide, live"
                icon={Scale}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
              {/* rate engine */}
              <Panel
                title="Global rate engine"
                description="Broadcast to every tenant instance on save."
                className="lg:col-span-2"
                action={
                  <Pill tone="gold">
                    <Radio className="size-3" />
                    Live
                  </Pill>
                }
              >
                <div className="divide-y divide-border/70">
                  {data.rates.map((r) => (
                    <RateRow
                      key={r._id}
                      metal={METAL_LABELS[r.metalType] ?? r.metalType}
                      purity={PURITY_LABELS[r.purityKarat] ?? String(r.purityKarat)}
                      rate={r.ratePerGram}
                      onSave={async (value) => {
                        try {
                          await updateRate({ id: r._id, ratePerGram: value });
                          toast.success(
                            `${r.metalType} ${r.purityKarat} broadcast to all tenants.`,
                          );
                        } catch (e) {
                          toast.error(
                            e instanceof Error ? e.message : "Could not broadcast",
                          );
                        }
                      }}
                    />
                  ))}
                </div>
              </Panel>

              {/* plans */}
              <Panel title="SaaS plans" className="lg:col-span-3">
                <div className="grid gap-3 p-4 sm:grid-cols-3">
                  {data.plans.map((p) => (
                    <div
                      key={p._id}
                      className="rounded-lg border border-border/70 p-4"
                    >
                      <p className="text-sm font-semibold">{p.label}</p>
                      <p className="nums mt-1 text-lg font-semibold text-primary">
                        {formatINR(p.monthlyPrice)}
                        <span className="text-[11px] font-normal text-muted-foreground">
                          /mo
                        </span>
                      </p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">{p.blurb}</p>
                      <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                        <li>· {p.maxStaff} staff seats</li>
                        <li>· {p.maxItems.toLocaleString("en-IN")} items</li>
                        <li>· Girvi {p.girviEnabled ? "enabled" : "not included"}</li>
                      </ul>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            {/* tenant registry */}
            <Panel
              title="Tenant registry"
              description="Each row owns an isolated PostgreSQL schema and a subdomain."
            >
              {data.tenants.length === 0 ? (
                <EmptyState
                  icon={Server}
                  title="No tenants yet"
                  hint="Onboard the first jeweller to provision their schema."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-5 py-2.5 font-medium">Jeweller</th>
                        <th className="px-5 py-2.5 font-medium">Schema</th>
                        <th className="px-5 py-2.5 font-medium">Plan</th>
                        <th className="px-5 py-2.5 text-right font-medium">Items</th>
                        <th className="px-5 py-2.5 text-right font-medium">Girvi</th>
                        <th className="px-5 py-2.5 font-medium">Status</th>
                        <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {data.tenants.map((t) => (
                        <tr key={t._id} className="transition-colors hover:bg-muted/40">
                          <td className="px-5 py-3">
                            <p className="font-medium">{t.businessName}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {t.subdomain}.gehnacloud · {t.city ?? "—"}
                              {t.gstin ? ` · ${t.gstin}` : ""}
                            </p>
                          </td>
                          <td className="px-5 py-3 font-mono text-[11px] text-primary">
                            {t.schemaName}
                          </td>
                          <td className="px-5 py-3">
                            <select
                              className="h-8 rounded-md border border-input bg-background px-2 text-[11px]"
                              value={t.planTier}
                              onChange={async (e) => {
                                try {
                                  await changePlan({
                                    tenantId: t._id,
                                    planTier: e.target.value,
                                  });
                                  toast.success(
                                    `${t.businessName} moved to ${e.target.value}.`,
                                  );
                                } catch (err) {
                                  toast.error(
                                    err instanceof Error
                                      ? err.message
                                      : "Could not change plan",
                                  );
                                }
                              }}
                            >
                              {data.plans.map((p) => (
                                <option key={p.tier} value={p.tier}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="nums px-5 py-3 text-right text-xs">
                            {t.usage.items}
                          </td>
                          <td className="nums px-5 py-3 text-right text-xs">
                            {t.usage.openLoans}
                          </td>
                          <td className="px-5 py-3">
                            <Pill tone={STATUS_TONE[t.status] ?? "neutral"}>
                              {t.status}
                            </Pill>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                const next =
                                  t.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
                                try {
                                  await setTenantStatus({
                                    tenantId: t._id,
                                    status: next,
                                  });
                                  toast.success(`${t.businessName} ${next.toLowerCase()}.`);
                                } catch (err) {
                                  toast.error(
                                    err instanceof Error
                                      ? err.message
                                      : "Could not update status",
                                  );
                                }
                              }}
                            >
                              {t.status === "SUSPENDED" ? "Activate" : "Suspend"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <AuditTrail tenants={data.tenants} />
          </>
        )}
      </main>
    </div>
  );
}

function RateRow({
  metal,
  purity,
  rate,
  onSave,
}: {
  metal: string;
  purity: string;
  rate: number;
  onSave: (value: number) => Promise<void>;
}) {
  const [value, setValue] = useState(rate);
  const [busy, setBusy] = useState(false);
  const dirty = value !== rate;

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{metal}</p>
        <p className="text-[11px] text-muted-foreground">{purity}</p>
      </div>
      <input
        type="number"
        step="1"
        className="nums h-8 w-28 rounded-md border border-input bg-background px-2 text-right text-sm"
        value={value}
        onChange={(e) => setValue(Number(e.target.value) || 0)}
      />
      <Button
        size="sm"
        variant={dirty ? "default" : "ghost"}
        disabled={busy || !dirty}
        onClick={async () => {
          setBusy(true);
          await onSave(value);
          setBusy(false);
        }}
      >
        {busy && <Loader2 className="size-3 animate-spin" />}
        {dirty ? "Broadcast" : "—"}
      </Button>
    </div>
  );
}

function ProvisionPanel({
  plans,
  onSubmit,
}: {
  plans: { tier: string; label: string }[];
  onSubmit: (args: {
    businessName: string;
    ownerName: string;
    ownerEmail: string;
    planTier: string;
    city?: string;
    state?: string;
    gstin?: string;
    phone?: string;
  }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    ownerName: "",
    ownerEmail: "",
    planTier: plans[0]?.tier ?? "RETAIL_BASIC",
    city: "",
    state: "",
    gstin: "",
    phone: "",
  });

  const field = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm";
  const label = "text-[10px] uppercase tracking-wider text-muted-foreground";

  return (
    <Panel
      title="Tenant lifecycle engine"
      description="Reserves a unique subdomain and PostgreSQL schema name, then registers the tenant for seeding."
    >
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block lg:col-span-2">
          <span className={label}>Business name</span>
          <input
            className={`${field} mt-1`}
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            placeholder="e.g. Zaira Fine Gold"
          />
        </label>
        <label className="block">
          <span className={label}>Owner name</span>
          <input
            className={`${field} mt-1`}
            value={form.ownerName}
            onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
          />
        </label>
        <label className="block">
          <span className={label}>Owner email</span>
          <input
            className={`${field} mt-1`}
            value={form.ownerEmail}
            onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
            placeholder="owner@example.in"
          />
        </label>
        <label className="block">
          <span className={label}>Plan</span>
          <select
            className={`${field} mt-1`}
            value={form.planTier}
            onChange={(e) => setForm({ ...form, planTier: e.target.value })}
          >
            {plans.map((p) => (
              <option key={p.tier} value={p.tier}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>City</span>
          <input
            className={`${field} mt-1`}
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </label>
        <label className="block">
          <span className={label}>GSTIN</span>
          <input
            className={`${field} mt-1 uppercase`}
            value={form.gstin}
            onChange={(e) => setForm({ ...form, gstin: e.target.value })}
            placeholder="08ABCDE1234F1Z5"
          />
        </label>
        <label className="block">
          <span className={label}>Phone</span>
          <input
            className={`${field} mt-1`}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </label>
      </div>
      <div className="flex justify-end border-t border-border/70 px-5 py-3">
        <Button
          size="sm"
          disabled={busy || !form.businessName || !form.ownerEmail}
          onClick={async () => {
            setBusy(true);
            await onSubmit({
              ...form,
              city: form.city || undefined,
              gstin: form.gstin || undefined,
              phone: form.phone || undefined,
            });
            setBusy(false);
          }}
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Provision tenant
        </Button>
      </div>
    </Panel>
  );
}
