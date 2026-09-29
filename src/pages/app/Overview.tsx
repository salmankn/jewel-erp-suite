import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/components/app/AppShell";
import { WhatsAppSend } from "@/components/app/WhatsAppSend";
import { EmptyState, Money, PageHeader, Panel, Pill, Stat } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import {
  METAL_LABELS,
  PURITY_LABELS,
  canAccess,
  formatDate,
  formatGrams,
  formatINR,
} from "@/lib/gehnacloud";
import { useQuery } from "convex/react";
import {
  ArrowUpRight,
  Boxes,
  FileText,
  Receipt,
  Scale,
  ShieldAlert,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";
import { Link } from "react-router";

export default function Overview() {
  const { tenant, role, user } = useWorkspace();
  const showGirvi = canAccess(role, "girvi");
  const showPos = canAccess(role, "pos");
  const showInventory = canAccess(role, "inventory");
  const showKarigar = canAccess(role, "karigar");

  const rates = useQuery(api.rates.board);
  const girvi = useQuery(api.girvi.list, showGirvi ? {} : "skip");
  const invoices = useQuery(api.billing.recent, showPos ? {} : "skip");
  const inventory = useQuery(api.inventory.list, showInventory ? {} : "skip");
  const karigar = useQuery(api.karigar.list, showKarigar ? {} : "skip");
  const customers = useQuery(api.customers.list, {});

  const firstName = (user.name || user.email || "there").split(/[\s@]/)[0];
  const rateMax = rates?.length ? Math.max(...rates.map((r) => r.ratePerGram)) : 0;

  // Risk rail: everything that wants a human before month-end.
  const alerts: { tone: "crit" | "warn" | "info"; text: string; to: string }[] = [];
  if (girvi?.summary.atRisk) {
    alerts.push({
      tone: girvi.summary.critical > 0 ? "crit" : "warn",
      text: `${girvi.summary.atRisk} Girvi loan${
        girvi.summary.atRisk > 1 ? "s" : ""
      } above the 75% LTV threshold — ${girvi.summary.critical} critical.`,
      to: "/app/girvi",
    });
  }
  if (girvi?.summary.overdue) {
    alerts.push({
      tone: "warn",
      text: `${girvi.summary.overdue} pledge${
        girvi.summary.overdue > 1 ? "s are" : " is"
      } past the grace window and attracting penal interest.`,
      to: "/app/girvi",
    });
  }
  if (inventory?.summary.pledged) {
    alerts.push({
      tone: "info",
      text: `${inventory.summary.pledged} item${
        inventory.summary.pledged > 1 ? "s are" : " is"
      } held against Girvi collateral.`,
      to: "/app/inventory",
    });
  }
  if (karigar?.summary.excessWastageJobs) {
    alerts.push({
      tone: "warn",
      text: `${karigar.summary.excessWastageJobs} job card${
        karigar.summary.excessWastageJobs > 1 ? "s" : ""
      } returned above the allowed wastage.`,
      to: "/app/karigar",
    });
  }
  if (customers?.summary.kycPending) {
    alerts.push({
      tone: "info",
      text: `${customers.summary.kycPending} customer KYC ${
        customers.summary.kycPending > 1 ? "records are" : "record is"
      } still pending verification.`,
      to: "/app/customers",
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Namaste, ${firstName}`}
        description={`${tenant.businessName} · ${tenant.city ?? "—"}, ${tenant.state ?? "—"} · GSTIN ${tenant.gstin ?? "pending"}`}
        action={
          showPos ? (
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/app/pos">
                <Receipt className="size-4" />
                New bill
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* ── KPIs ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {showPos && invoices && (
          <>
            <Stat
              index={0}
              label="Billed to date"
              value={formatINR(invoices.summary.revenue)}
              sub={`${invoices.summary.count} invoices`}
              icon={FileText}
              tone="gold"
            />
            <Stat
              index={1}
              label="GST collected"
              value={formatINR(invoices.summary.gstCollected)}
              sub="CGST + SGST + IGST"
              icon={Receipt}
            />
          </>
        )}
        {showInventory && inventory && (
          <Stat
            index={1}
            label="Stock weight"
            value={formatGrams(inventory.summary.netWeight)}
            sub={`${inventory.summary.inStock} pieces on the shelf`}
            icon={Boxes}
          />
        )}
        {showGirvi && girvi && (
          <Stat
            index={2}
            label="Girvi outstanding"
            value={formatINR(girvi.summary.outstanding)}
            sub={`${girvi.summary.activeCount} open pledges · ${formatGrams(girvi.summary.collateralWeight)} held`}
            icon={Scale}
            tone={girvi.summary.atRisk > 0 ? "warn" : "neutral"}
          />
        )}
        {showKarigar && karigar && (
          <Stat
            index={2}
            label="Metal with Karigars"
            value={formatGrams(karigar.summary.metalInHand)}
            sub={`${karigar.summary.openJobs} open job cards`}
            icon={Wrench}
          />
        )}
        {customers && (
          <Stat
            index={3}
            label="Customers"
            value={customers.summary.total}
            sub={`${customers.summary.kittyMembers} on Kitty schemes`}
            icon={Users}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ── risk rail ── */}
        <Panel
          title="Needs attention"
          description="Recomputed against today's rate board."
          className="lg:col-span-2"
          action={
            alerts.length > 0 ? (
              <Pill tone="crit">
                <TriangleAlert className="size-3" />
                {alerts.length}
              </Pill>
            ) : undefined
          }
        >
          {alerts.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="Nothing flagged"
              hint="No LTV breaches, overdue pledges or wastage overruns right now."
            />
          ) : (
            <ul className="divide-y divide-border/70">
              {alerts.map((a, i) => (
                <li key={i}>
                  <Link
                    to={a.to}
                    className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50"
                  >
                    <Pill tone={a.tone}>
                      <TriangleAlert className="size-3" />
                    </Pill>
                    <span className="flex-1 text-[13px] leading-relaxed text-muted-foreground">
                      {a.text}
                    </span>
                    <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ── live rate board ── */}
        <Panel
          title="Live rate board"
          description="Central engine · broadcast to every tenant."
          className="lg:col-span-3"
          action={<Pill tone="gold">MCX feed</Pill>}
        >
          <div className="divide-y divide-border/70">
            {(rates ?? []).map((r) => {
              const pct = rateMax > 0 ? (r.ratePerGram / rateMax) * 100 : 0;
              return (
                <div key={r._id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-28 shrink-0">
                    <p className="text-[13px] font-medium">{METAL_LABELS[r.metalType]}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {PURITY_LABELS[r.purityKarat] ?? `${r.purityKarat}`}
                    </p>
                  </div>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="nums w-24 shrink-0 text-right text-sm font-semibold">
                    ₹{r.ratePerGram.toLocaleString("en-IN")}
                  </p>
                </div>
              );
            })}
            {!rates?.length && (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                Publishing the rate board…
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* ── recent invoices ── */}
      {showPos && invoices && (
        <Panel
          title="Recent invoices"
          description={`${invoices.invoices.length} most recent bills`}
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/pos">Open counter</Link>
            </Button>
          }
        >
          {invoices.invoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No bills yet"
              hint="Ring up the first sale at the counter to see it here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-2.5 font-medium">Invoice</th>
                    <th className="px-5 py-2.5 font-medium">Customer</th>
                    <th className="px-5 py-2.5 font-medium">Date</th>
                    <th className="px-5 py-2.5 font-medium">Settlement</th>
                    <th className="w-10 px-3 py-2.5" />
                    {invoices.showMoney && (
                      <th className="px-5 py-2.5 text-right font-medium">GST</th>
                    )}
                    <th className="px-5 py-2.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {invoices.invoices.map((inv) => (
                    <tr key={inv._id} className="transition-colors hover:bg-muted/40">
                      <td className="px-5 py-3 font-mono text-xs">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-5 py-3">{inv.customerName}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {formatDate(inv.createdAt)}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {inv.paymentMode}
                      </td>
                      {invoices.showMoney && (
                        <td className="px-5 py-3 text-right text-xs text-muted-foreground">
                          <Money value={inv.cgst + inv.sgst + inv.igst} />
                        </td>
                      )}
                      <td className="px-5 py-3 text-right font-semibold">
                        <Money value={inv.grandTotal} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <WhatsAppSend kind="INVOICE" invoiceId={inv._id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
