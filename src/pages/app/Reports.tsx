import { api } from "@/convex/_generated/api";
import { Money, PageHeader, Panel, Pill, Stat } from "@/components/app/ui";
import { formatDate, formatINR } from "@/lib/gehnacloud";
import { useQuery } from "convex/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Landmark,
  Receipt,
  Scale,
  TrendingUp,
  Wrench,
} from "lucide-react";

/**
 * Store Owner financial statements — PRD RBAC: P&L and balance sheet are
 * owner-level surfaces. The accountant sees the P&L; the balance sheet is
 * owner-only and the query enforces that server-side.
 */
export default function Reports() {
  const pl = useQuery(api.finance.profitAndLoss, { months: 6 });
  const bs = useQuery(
    api.finance.balanceSheet,
    pl !== undefined ? {} : "skip",
  );

  const peak = Math.max(1, ...(pl?.monthly.map((m) => m.revenue) ?? [1]));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Financial reports"
        description="Derived live from the invoice, purchase and Girvi ledgers. GST is never counted as revenue."
      />

      {!pl ? (
        <div className="rounded-xl border border-border/70 bg-card px-6 py-16 text-center text-sm text-muted-foreground">
          Compiling your accounts…
        </div>
      ) : (
        <>
          {/* ── P&L headline ── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Revenue (taxable)"
              value={formatINR(pl.headline.revenue)}
              sub={`${pl.headline.invoiceCount} invoices`}
              icon={TrendingUp}
              tone="gold"
            />
            <Stat
              label="Gross profit"
              value={formatINR(pl.headline.grossProfit)}
              sub={`${pl.headline.grossMarginPct}% margin`}
              icon={BarChart3}
            />
            <Stat
              label="Karigar labour"
              value={formatINR(pl.headline.labour)}
              sub="Expensed on received jobs"
              icon={Wrench}
            />
            <Stat
              label="Net profit"
              value={formatINR(pl.headline.netProfit)}
              sub={`${pl.headline.netMarginPct}% net margin`}
              icon={Receipt}
              tone={pl.headline.netProfit >= 0 ? "safe" : "crit"}
            />
          </div>

          {/* ── monthly chart ── */}
          <Panel
            title="Revenue vs cost — last 6 months"
            description="Bars show taxable revenue; the gold line is gross profit."
          >
            <div className="space-y-3 px-5 py-5">
              {pl.monthly.map((m) => (
                <div key={m.key} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
                    {new Date(`${m.key}-01T00:00:00`).toLocaleDateString("en-IN", {
                      month: "short",
                    })}
                  </span>
                  <div className="relative h-6 flex-1 overflow-hidden rounded bg-muted">
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-primary/35"
                      style={{ width: `${(m.revenue / peak) * 100}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-primary"
                      style={{ width: `${(Math.max(0, m.profit) / peak) * 100}%` }}
                    />
                    <span className="nums absolute inset-y-0 right-2 flex items-center text-[11px] font-medium">
                      {formatINR(m.revenue)}
                    </span>
                  </div>
                  <span
                    className={`nums w-20 shrink-0 text-right text-[11px] ${
                      m.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                    }`}
                  >
                    {m.profit >= 0 ? "+" : ""}
                    {formatINR(m.profit)}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          {/* ── working capital ── */}
          <Panel title="GST working capital" description="Outward tax less recoverable inward credit.">
            <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
              <Flow
                label="Output GST (sales)"
                value={pl.workingCapital.outputGst}
                up
                icon={ArrowUpRight}
              />
              <Flow
                label="Input GST (purchases)"
                value={pl.workingCapital.itcClaimable}
                down
                icon={ArrowDownRight}
              />
              <div className="rounded-lg bg-muted/60 px-3 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  GST payable
                </p>
                <p className="nums mt-1 text-lg font-semibold text-primary">
                  {formatINR(pl.workingCapital.gstPayable)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/60 px-3 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Metal purchased
                </p>
                <p className="nums mt-1 text-lg font-semibold">
                  {formatINR(pl.workingCapital.purchasesValue)}
                </p>
              </div>
            </div>
          </Panel>

          {/* ── balance sheet ── */}
          {bs ? (
            <Panel
              title="Balance sheet"
              description={`Derived from the books as at ${formatDate(bs.asOf)}.`}
              action={
                <Pill tone="neutral">
                  <Landmark className="size-3" />
                  {bs.stockUnits} stock units
                </Pill>
              }
            >
              <div className="grid gap-px bg-border lg:grid-cols-3">
                <Column
                  title="Assets"
                  tone="safe"
                  rows={bs.assets}
                  total={bs.totals.assets}
                />
                <Column
                  title="Liabilities"
                  tone="warn"
                  rows={bs.liabilities}
                  total={bs.totals.liabilities}
                />
                <div className="bg-card p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Equity
                  </p>
                  <dl className="mt-3 space-y-2.5 text-sm">
                    <Line label="Retained profit" value={bs.totals.retained} />
                    <Line label="Balancing (capital)" value={bs.totals.balancing} />
                    <div className="flex items-center justify-between border-t border-border pt-2.5 text-base font-semibold">
                      <dt>Owner capital</dt>
                      <dd className="nums text-primary">
                        {formatINR(bs.totals.capital)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    Owner capital is not tracked as a separate ledger, so it is the
                    residual that makes assets equal liabilities plus retained profit.
                    {bs.lastBillDays > 0 && ` Last bill raised ${bs.lastBillDays} days ago.`}
                  </p>
                </div>
              </div>
            </Panel>
          ) : (
            <Panel title="Balance sheet">
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                The balance sheet is restricted to the Store Owner role.
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function Column({
  title,
  rows,
  total,
  tone,
}: {
  title: string;
  rows: { label: string; value: number }[];
  total: number;
  tone: "safe" | "warn";
}) {
  return (
    <div className="bg-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <dl className="mt-3 space-y-2.5 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="nums shrink-0 font-medium">
              <Money value={r.value} />
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-2.5 text-base font-semibold">
          <dt>Total {title.toLowerCase()}</dt>
          <dd className={`nums ${tone === "safe" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
            {formatINR(total)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Flow({
  label,
  value,
  up,
  down,
  icon: Icon,
}: {
  label: string;
  value: number;
  up?: boolean;
  down?: boolean;
  icon: typeof ArrowUpRight;
}) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-3">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="nums mt-1 text-lg font-semibold">{formatINR(value)}</p>
      {(up || down) && (
        <p className="text-[10px] text-muted-foreground">
          {up ? "You owe this" : "You recover this"}
        </p>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="nums font-medium">
        <Money value={value} />
      </dd>
    </div>
  );
}
