import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Boxes,
  Gem,
  Landmark,
  Lock,
  Receipt,
  Scale,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { computeInterest, formatINR } from "@/lib/gehnacloud";

const SIGN_IN = "/auth?returnTo=%2Fapp";

/** Fallback board so the hero ticker never renders empty before seeding. */
const FALLBACK_RATES = [
  { metalType: "GOLD", purityKarat: 24, ratePerGram: 98450 },
  { metalType: "GOLD", purityKarat: 22, ratePerGram: 90520 },
  { metalType: "GOLD", purityKarat: 18, ratePerGram: 74010 },
  { metalType: "SILVER", purityKarat: 925, ratePerGram: 112 },
];

const MODULES = [
  {
    icon: Scale,
    title: "GehnaGirvi Engine",
    tag: "Pawn broking",
    body: "Jama, Be-Cash and Chudai on pledged metal. Simple or compound interest with grace windows, penal rates, digital NOC on release, and loan-to-value monitoring that fires before a falling market turns a pledge into an auction.",
    points: ["Simple & compound engines", "Aadhaar KYC + e-signature", "Real-time LTV alerts"],
  },
  {
    icon: Boxes,
    title: "Smart Inventory",
    tag: "Stock & RFID",
    body: "Gross-to-net weight maths, HUID on every item, and RFID rapid audit. Pull live readings off a serial scale, print thermal jewellery tags with QR, and reconcile hundreds of tagged items in one scan.",
    points: ["Net weight auto-calc", "HUID + RFID tagging", "Thermal tag printing"],
  },
  {
    icon: Receipt,
    title: "Billing & GST",
    tag: "POS compliance",
    body: "Rates flow straight from the live metal board into the bill. 3% jewellery GST split into CGST/SGST or IGST, HUID mapped per line, split settlement across cash, UPI, card and old-gold exchange.",
    points: ["3% GST auto-calculated", "HUID per invoice line", "GSTR-1 & 3B export"],
  },
  {
    icon: HammerIcon,
    title: "Karigar Ledger",
    tag: "Job work",
    body: "Track fine metal issued to your goldsmiths against finished ornaments returned — measured in fine content, not gross weight. Wastage beyond the job-card allowance is surfaced before the piece reaches the counter.",
    points: ["Fine-metal reconciliation", "Tunch & wastage control", "Cash + Ghat balances"],
  },
  {
    icon: Wallet,
    title: "Kitty Savings",
    tag: "Customer CRM",
    body: "Monthly gold saving schemes with passbooks and installment tracking, plus WhatsApp dispatch of invoices, receipts and Girvi interest-due reminders straight from the ledger.",
    points: ["Monthly passbooks", "Maturity redemption", "WhatsApp receipts"],
  },
  {
    icon: ShieldCheck,
    title: "Isolated by design",
    tag: "Multi-tenant",
    body: "Every jeweller gets a dedicated schema and subdomain. Onboarding provisions the schema, seeds its books and hands out role-scoped seats in a single audited step.",
    points: ["Schema-per-tenant", "Scoped JWT context", "Immutable audit log"],
  },
] as const;

function HammerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m14.5 5.5 4 4" />
      <path d="M12.5 7.5 16.5 3.5l4 4-4 4z" />
      <path d="m14 9-9 9" />
      <path d="m7.5 15.5 3 3" />
    </svg>
  );
}

const ROLES = [
  {
    role: "Store Owner",
    body: "Unrestricted — P&L, staff, Girvi interest setup and the full audit trail.",
  },
  {
    role: "Sales Staff",
    body: "Counter billing, catalog lookup and tag printing. Costs and margins stay hidden.",
  },
  {
    role: "Girvi Operator",
    body: "Jama, Chudai, interest collection and KYC — and nothing from the retail floor.",
  },
  {
    role: "Accountant",
    body: "GST reports, ledgers, URD purchases and Karigar balances.",
  },
];

const PLANS = [
  {
    name: "Retail Basic",
    price: "₹2,499",
    period: "/month",
    blurb: "Counter billing and stock for a single-outlet store.",
    features: [
      "POS billing with 3% GST",
      "HUID-tagged inventory — 5,000 items",
      "Thermal tags & QR printing",
      "Daily sales and stock reports",
    ],
    featured: false,
  },
  {
    name: "Wholesale Pro",
    price: "₹6,499",
    period: "/month",
    blurb: "Metal accounting, Karigar ledgers and URD purchases.",
    features: [
      "Everything in Retail Basic",
      "Karigar issue/receive + wastage",
      "GSTR-1 & GSTR-3B export",
      "WhatsApp invoice dispatch",
      "25,000 items · 15 staff",
    ],
    featured: false,
  },
  {
    name: "Girvi Enterprise",
    price: "₹14,999",
    period: "/month",
    blurb: "Full pawn broking with LTV monitoring and auctions.",
    features: [
      "Everything in Wholesale Pro",
      "GehnaGirvi Jama, Be-Cash & Chudai",
      "Aadhaar KYC + digital signature",
      "Real-time LTV & auction alerts",
      "Unlimited items and branches",
    ],
    featured: true,
  },
];

const STATS = [
  { value: "1,240+", label: "Jewellers on the platform" },
  { value: "₹940 Cr", label: "Metal under management" },
  { value: "99.9%", label: "Uptime, backed by nightly snapshots" },
  { value: "<500 ms", label: "Invoice generate to print" },
];

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="h-px w-8 bg-primary/60" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
        {children}
      </span>
    </div>
  );
}

/** PRD Module 1 interest engine, running live on the marketing page. */
function InterestDemo() {
  const [amount, setAmount] = useState(250000);
  const [rate, setRate] = useState(1.5);
  const [months, setMonths] = useState(8);
  const [compound, setCompound] = useState(true);

  const now = new Date();
  now.setMonth(now.getMonth() - months);

  const result = useMemo(
    () =>
      computeInterest({
        pledgedAmount: amount,
        annualInterestRate: rate,
        interestType: compound ? "COMPOUND" : "SIMPLE",
        graceMonths: 1,
        penaltyRate: rate + 0.75,
        loanDate: now.getTime(),
        interestPaid: 0,
        principalPaid: 0,
      }),
    [amount, rate, months, compound, now],
  );

  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 p-6 backdrop-blur-sm sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold tracking-tight">
          Try the Girvi interest engine
        </h3>
        <Badge variant="secondary" className="rounded-full">
          Simple & compound
        </Badge>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Same arithmetic the server uses when it accrues interest on a live loan.
      </p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Pledged amount
          </span>
          <input
            type="range"
            min={50000}
            max={1500000}
            step={25000}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="mt-2 w-full accent-primary"
          />
          <span className="nums mt-1 block text-sm font-semibold">
            {formatINR(amount)}
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Interest rate (% p.a.)
          </span>
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.05}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="mt-2 w-full accent-primary"
          />
          <span className="nums mt-1 block text-sm font-semibold">
            {rate.toFixed(2)}%
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Months elapsed
          </span>
          <input
            type="range"
            min={1}
            max={36}
            step={1}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="mt-2 w-full accent-primary"
          />
          <span className="nums mt-1 block text-sm font-semibold">
            {months} month{months > 1 ? "s" : ""}
          </span>
        </label>

        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Interest type
          </span>
          <div className="mt-2 inline-flex rounded-lg border border-border p-1">
            {(["SIMPLE", "COMPOUND"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setCompound(t === "COMPOUND")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  (t === "COMPOUND") === compound
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "SIMPLE" ? "Simple" : "Compound"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            1 month grace, then {Number((rate + 0.75).toFixed(2))}% penal
          </p>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        {[
          { label: "Chargeable months", value: String(result.chargeableMonths) },
          { label: "Interest accrued", value: formatINR(result.interestAccrued) },
          { label: "Penal interest", value: formatINR(result.penalInterest) },
          { label: "Amount due", value: formatINR(result.amountDue) },
        ].map((s) => (
          <div key={s.label} className="bg-card px-4 py-3.5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
            <p className="nums mt-1 text-base font-semibold text-primary">
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const rates = useQuery(api.rates.board);
  const board = rates && rates.length > 0 ? rates : FALLBACK_RATES;

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      {/* ───────────────────────── nav ───────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Gem className="size-5" />
            </span>
            <span className="text-[17px] font-semibold tracking-tight">
              Gehna<span className="text-primary">Cloud</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#platform" className="transition-colors hover:text-foreground">
              Platform
            </a>
            <a href="#girvi" className="transition-colors hover:text-foreground">
              GehnaGirvi
            </a>
            <a href="#roles" className="transition-colors hover:text-foreground">
              Who it's for
            </a>
            <a href="#pricing" className="transition-colors hover:text-foreground">
              Pricing
            </a>
          </nav>

          <Button asChild size="sm" className="gap-1.5">
            <Link to={SIGN_IN}>
              Open your store <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      {/* ───────────────────────── hero ───────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="bg-loupe pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-16 sm:pt-24">
          <Reveal className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-7 rounded-full border-primary/40 bg-primary/10 px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-primary"
            >
              <Sparkles className="mr-1.5 size-3" />
              ERP & Girvi for the Indian jewellery trade
            </Badge>

            <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
              Every gram weighed.
              <br />
              <span className="text-gilded">Every promise kept.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              GehnaCloud runs retail billing, wholesale metal accounting and Girvi
              pawn broking on one isolated schema per jeweller — with HUID-grade
              stock, GST compliance and live-rate LTV monitoring built in.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="group h-11 px-7">
                <Link to={SIGN_IN}>
                  Start free for 60 days
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-7">
                <a href="#platform">Explore the modules</a>
              </Button>
            </div>
          </Reveal>

          {/* live rate board */}
          <Reveal delay={0.15} className="mx-auto mt-14 max-w-3xl">
            <div className="rounded-2xl border border-border/70 bg-card/50 p-1.5 backdrop-blur-sm">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Live rate board
                </span>
                <span className="text-[11px] text-muted-foreground">
                  broadcast to all tenants
                </span>
              </div>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-4">
                {board.slice(0, 4).map((r) => (
                  <div key={`${r.metalType}-${r.purityKarat}`} className="bg-card px-4 py-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {r.metalType === "GOLD"
                        ? `Gold ${r.purityKarat}K`
                        : `Silver ${r.purityKarat}`}
                    </p>
                    <p className="nums mt-1 text-lg font-semibold text-primary">
                      ₹{r.ratePerGram.toLocaleString("en-IN")}
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                        /g
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────────────── stats ───────────────────────── */}
      <section className="border-y border-border/60 bg-muted/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-border px-0 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="bg-background px-6 py-8 text-center">
              <p className="text-gilded nums text-2xl font-semibold sm:text-3xl">
                {s.value}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ───────────────────────── modules ───────────────────────── */}
      <section id="platform" className="mx-auto max-w-6xl px-5 py-24">
        <Reveal className="max-w-2xl">
          <SectionLabel>The platform</SectionLabel>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Five engines, one ledger
          </h2>
          <p className="mt-4 text-muted-foreground">
            Retail, wholesale, pawn broking, job work and customer savings stop
            being five spreadsheets fighting each other. They read and write the
            same books.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m, i) => {
            const Icon = m.icon;
            return (
              <Reveal key={m.title} delay={i * 0.06} className="h-full">
                <div className="group flex h-full flex-col rounded-2xl border border-border/70 bg-card/50 p-6 transition-colors hover:border-primary/40 hover:bg-card">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary transition-transform group-hover:scale-105">
                    <Icon className="size-5" />
                  </div>
                  <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                    {m.tag}
                  </p>
                  <h3 className="mt-1.5 text-lg font-semibold tracking-tight">
                    {m.title}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {m.body}
                  </p>
                  <ul className="mt-5 space-y-2 border-t border-border/70 pt-4">
                    {m.points.map((p) => (
                      <li
                        key={p}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <span className="size-1 rounded-full bg-primary" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ───────────────────────── girvi demo ───────────────────────── */}
      <section id="girvi" className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 lg:grid-cols-2">
          <Reveal>
            <SectionLabel>Module one</SectionLabel>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Girvi that watches the market
            </h2>
            <p className="mt-4 text-muted-foreground">
              A pledge is only as safe as the metal backing it. GehnaCloud
              recomputes loan-to-value against the live rate on every tick — and
              raises an auction notice before a rate fall turns collateral into a
              shortfall.
            </p>
            <ul className="mt-7 space-y-3.5">
              {[
                "Grace periods and penal rates per loan, not per shop",
                "Be-Cash applies payment to interest before principal",
                "Chudai settles the loan and generates the NOC automatically",
                "Aadhaar / PAN upload with OTP and on-screen signature",
                "Transfer pledged items between accounts or branches",
              ].map((p) => (
                <li key={p} className="flex gap-3 text-sm text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  {p}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.12}>
            <InterestDemo />
          </Reveal>
        </div>
      </section>

      {/* ───────────────────────── isolation ───────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <SectionLabel>Data isolation</SectionLabel>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              One platform, a schema each
            </h2>
            <p className="mt-4 text-muted-foreground">
              Onboarding a jeweller provisions a dedicated PostgreSQL schema,
              claims a subdomain and seeds its opening books — then every request
              from that store is pinned to that schema by the JWT it carries.
              One jeweller can never read another's grams.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              {[
                "Schema per tenant",
                "Subdomain routing",
                "Role-scoped JWT",
                "Immutable audit log",
                "Nightly snapshots",
              ].map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
                >
                  {p}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/60">
              <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
                <span className="size-2.5 rounded-full bg-destructive/60" />
                <span className="size-2.5 rounded-full bg-primary/60" />
                <span className="size-2.5 rounded-full bg-emerald-500/60" />
                <span className="ml-2 text-[11px] text-muted-foreground">
                  tenant_routing.middleware.ts
                </span>
              </div>
              <pre className="overflow-x-auto p-5 text-[12px] leading-relaxed">
                <code className="text-muted-foreground">
                  {`// every request carries its tenant in the token
const schema = req.user?.schema_name;
if (!schema) throw Forbidden();

await db.query(
  \`SET search_path TO \${schema}, public;\`
);

return withSchema(schema, () =>
  handle(req, res, next)
);`}
                </code>
              </pre>
              <div className="border-t border-border/70 bg-muted/50 px-5 py-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Live schemas
                </p>
                <div className="mt-2.5 space-y-1.5 font-mono text-xs">
                  {[
                    "tenant_manglam_jewellers",
                    "tenant_zaira_fine_gold",
                    "tenant_deepak_sons_bullion",
                  ].map((s, i) => (
                    <p key={s} className="flex items-center gap-2">
                      <Lock className="size-3 text-primary" />
                      <span className="text-muted-foreground">{s}</span>
                      <span className="ml-auto text-[11px] text-emerald-500/80">
                        {i === 0 ? "active" : i === 1 ? "active" : "provisioning"}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────────────── roles ───────────────────────── */}
      <section id="roles" className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <Reveal className="max-w-2xl">
            <SectionLabel>Role-based access</SectionLabel>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Everyone sees exactly their counter
            </h2>
            <p className="mt-4 text-muted-foreground">
              A sales associate never sees margin. A Girvi operator never sees the
              retail floor. Access is enforced on the server, not just hidden in
              the menu.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((r, i) => (
              <Reveal key={r.role} delay={i * 0.06} className="h-full">
                <div className="flex h-full flex-col rounded-xl border border-border/70 bg-card/50 p-5">
                  <Users className="size-5 text-primary" />
                  <h3 className="mt-4 text-sm font-semibold tracking-tight">
                    {r.role}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    {r.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────── pricing ───────────────────────── */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 py-24">
        <Reveal className="max-w-2xl">
          <SectionLabel>Plans</SectionLabel>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Priced per counter, not per gram
          </h2>
          <p className="mt-4 text-muted-foreground">
            Every plan starts with a 60-day trial. Move up a tier as you open
            branches — your books and history come with you.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.08} className="h-full">
              <div
                className={`relative flex h-full flex-col rounded-2xl border p-6 ${
                  p.featured
                    ? "border-primary/50 bg-gradient-to-b from-primary/12 to-card shadow-[0_0_50px_-18px_oklch(0.79_0.135_85/0.55)]"
                    : "border-border/70 bg-card/50"
                }`}
              >
                {p.featured && (
                  <Badge className="absolute -top-2.5 left-6 rounded-full bg-primary text-primary-foreground">
                    Most chosen
                  </Badge>
                )}
                <h3 className="text-base font-semibold tracking-tight">{p.name}</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">{p.blurb}</p>
                <p className="mt-5 flex items-baseline gap-1">
                  <span className="nums text-3xl font-semibold tracking-tight">
                    {p.price}
                  </span>
                  <span className="text-xs text-muted-foreground">{p.period}</span>
                </p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-[13px] text-muted-foreground">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className="mt-7 w-full"
                  variant={p.featured ? "default" : "outline"}
                >
                  <Link to={SIGN_IN}>Start 60-day trial</Link>
                </Button>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────────────────────── CTA ───────────────────────── */}
      <section className="relative overflow-hidden border-t border-border/60">
        <div className="bg-loupe pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-3xl px-5 py-24 text-center">
          <Reveal>
            <Landmark className="mx-auto size-9 text-primary" />
            <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Your counter is open. Your books should be too.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Sign in with any email — we'll provision an isolated workspace,
              seed a full set of books and drop you at the dashboard.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="group h-11 px-7">
                <Link to={SIGN_IN}>
                  <Store className="size-4" />
                  Open my jeweller workspace
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="h-11 px-7">
                <Link to="/auth?returnTo=%2Fadmin">
                  <ScrollText className="size-4" />
                  Platform operator
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────────────── footer ───────────────────────── */}
      <footer className="border-t border-border/60 bg-muted/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground">
              <Gem className="size-3.5" />
            </span>
            <span className="font-medium text-foreground">GehnaCloud</span>
            <span>— ERP &amp; Girvi Engine v1.0</span>
          </div>
          <p>Built for Indian jewellers, wholesalers and Girvi operators.</p>
        </div>
      </footer>
    </div>
  );
}
