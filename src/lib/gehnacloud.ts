/**
 * GehnaCloud domain rules (PRD §3).
 *
 * Pure, dependency-free helpers shared by the Convex backend and the React
 * client so a bill previewed in the browser and the bill persisted by the
 * server are guaranteed to use the same arithmetic.
 */

// Relative import: this module is bundled by both Vite (client) and Convex's
// esbuild (server), and only the latter is guaranteed to honour the `@/` alias.
import type { Role } from "../convex/schema";

// ────────────────────────────────── constants ──────────────────────────────────

export const METAL_LABELS: Record<string, string> = {
  GOLD: "Gold",
  SILVER: "Silver",
  PLATINUM: "Platinum",
};

export const PURITY_LABELS: Record<number, string> = {
  24: "24K / 999",
  22: "22K / 916",
  18: "18K / 750",
  14: "14K / 585",
  925: "925 Silver",
  950: "950 Silver",
};

export const CATEGORY_LABELS: Record<string, string> = {
  BANGLE: "Bangle",
  NECKLACE: "Necklace",
  RING: "Ring",
  PENDANT: "Pendant",
  CHAIN: "Chain",
  NOSEPIN: "Nosepin",
  COIN: "Coin",
  BRACELET: "Bracelet",
  SET: "Set",
  EARRING: "Earring",
};

/** Jewellery attracts 3% GST: CGST 1.5% + SGST 1.5% intra-state, else IGST 3%. */
export const GST_RATE_PCT = 3;
export const CGST_RATE_PCT = 1.5;
export const SGST_RATE_PCT = 1.5;
export const IGST_RATE_PCT = 3;

/** PRD Module 1: warn when the loan exceeds 75% of live collateral value. */
export const LTV_ALERT_THRESHOLD_PCT = 75;

// ────────────────────────────────── formatting ──────────────────────────────────

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(value: number, precise = false): string {
  const n = Number.isFinite(value) ? value : 0;
  return precise ? inrPrecise.format(n) : inr.format(n);
}

/** Indian short scale — 1.25 L, 3.4 Cr. Used where column width is tight. */
export function formatCompactINR(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return inr.format(n);
}

/** Grams to 3 decimals — the precision jewellery is traded at. */
export function formatGrams(value: number): string {
  return `${(Number.isFinite(value) ? value : 0).toFixed(3)} g`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ──────────────────────────────── inventory maths ───────────────────────────────

export interface WeightBreakdown {
  grossWeight: number;
  stoneWeight: number;
  /** Enamel / thread / polish loss folded into the gross. */
  enamelWeight: number;
  netWeight: number;
}

/**
 * PRD Module 2: Net Weight = Gross − (Stone Weight + Enamel/Thread Weight).
 * Never returns a negative net weight — a bad scan should clamp at 0 rather
 * than push a phantom liability into the stock book.
 */
export function computeNetWeight(input: {
  grossWeight: number;
  stoneWeight?: number;
  enamelWeight?: number;
}): WeightBreakdown {
  const grossWeight = Math.max(0, input.grossWeight || 0);
  const stoneWeight = Math.max(0, input.stoneWeight || 0);
  const enamelWeight = Math.max(0, input.enamelWeight || 0);
  const netWeight = Math.max(0, round3(grossWeight - stoneWeight - enamelWeight));
  return { grossWeight, stoneWeight, enamelWeight, netWeight };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round2(n: number): number {
  return Math.round(n * 1000) / 100;
}

// ────────────────────────────── billing engine (GST) ────────────────────────────

export interface PriceLineInput {
  netWeight: number;
  ratePerGram: number;
  makingChargePerGram: number;
  stoneValue: number;
  /** Discount as a percentage of the metal value. */
  discountPct: number;
}

export interface PriceLine {
  /** Metal value at the live rate. */
  metalValue: number;
  makingCharge: number;
  stoneValue: number;
  discount: number;
  amount: number;
}

/**
 * PRD Module 3: item value = (net weight × live rate) + making charge
 * (per gram) + stone value − discount.
 */
export function priceLine(input: PriceLineInput): PriceLine {
  const netWeight = Math.max(0, input.netWeight || 0);
  const ratePerGram = Math.max(0, input.ratePerGram || 0);
  const metalValue = netWeight * ratePerGram;
  const makingCharge = netWeight * Math.max(0, input.makingChargePerGram || 0);
  const stoneValue = Math.max(0, input.stoneValue || 0);
  const discount = ((metalValue + makingCharge) * Math.max(0, input.discountPct || 0)) / 100;
  const amount = Math.max(0, metalValue + makingCharge + stoneValue - discount);
  return {
    metalValue: round2(metalValue),
    makingCharge: round2(makingCharge),
    stoneValue: round2(stoneValue),
    discount: round2(discount),
    amount: round2(amount),
  };
}

export interface GstBreakdown {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/**
 * 3% jewellery GST. Same-state sales split into CGST + SGST; inter-state
 * sales are charged a single IGST at the full 3%.
 */
export function computeGst(taxableValue: number, interState = false): GstBreakdown {
  const value = round2(Math.max(0, taxableValue));
  if (interState) {
    const igst = round2((value * IGST_RATE_PCT) / 100);
    return { taxableValue: value, cgst: 0, sgst: 0, igst, total: round2(value + igst) };
  }
  const cgst = round2((value * CGST_RATE_PCT) / 100);
  const sgst = round2((value * SGST_RATE_PCT) / 100);
  return { taxableValue: value, cgst, sgst, igst: 0, total: round2(value + cgst + sgst) };
}

export interface PaymentSplit {
  mode: string;
  amount: number;
}

/** Multi-payment settlement across cash / UPI / card / bank / old-gold exchange. */
export function validateSplits(
  splits: PaymentSplit[],
  grandTotal: number,
): { ok: boolean; message?: string } {
  const sum = round2(splits.reduce((acc, s) => acc + (s.amount || 0), 0));
  if (sum <= 0) return { ok: false, message: "Add at least one payment." };
  if (sum < round2(grandTotal)) {
    return {
      ok: false,
      message: `Short by ${formatINR(round2(grandTotal) - sum)}. Settlement must cover the invoice total.`,
    };
  }
  if (sum > round2(grandTotal)) {
    return {
      ok: false,
      message: `Overpaid by ${formatINR(sum - round2(grandTotal))}. Adjust the splits.`,
    };
  }
  return { ok: true };
}

// ────────────────────────────── GehnaGirvi interest ─────────────────────────────

export interface LoanTerms {
  pledgedAmount: number;
  annualInterestRate: number;
  interestType: "SIMPLE" | "COMPOUND";
  graceMonths: number;
  penaltyRate: number;
  loanDate: number;
  interestPaid: number;
  principalPaid: number;
}

export interface InterestBreakdown {
  monthsElapsed: number;
  /** Months of interest actually chargeable after the grace period. */
  chargeableMonths: number;
  interestAccrued: number;
  penalInterest: number;
  totalInterest: number;
  outstandingInterest: number;
  outstandingPrincipal: number;
  /** Final figure the customer must pay to settle (Chudai). */
  amountDue: number;
}

/** Whole months elapsed since `loanDate`, ignoring the partial current month. */
export function monthsBetween(fromMs: number, toMs: number): number {
  const from = new Date(fromMs);
  const to = new Date(toMs);
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * Interest engine (PRD Module 1).
 *
 * Simple   : I = P · r · n          (flat on the original principal)
 * Compound : I = P · ((1+r)^n − 1)  (compounded monthly on the accrued amount)
 *
 * The grace period is deducted from elapsed months before charging. Once a
 * loan runs past its grace window the configured penal rate is charged as an
 * additional percentage on the principal — this is what drives the auction
 * notice workflow.
 */
export function computeInterest(
  terms: LoanTerms,
  nowMs: number = Date.now(),
): InterestBreakdown {
  const monthsElapsed = monthsBetween(terms.loanDate, nowMs);
  const chargeableMonths = Math.max(0, monthsElapsed - Math.max(0, terms.graceMonths));

  const principal = Math.max(0, terms.pledgedAmount);
  const monthlyRate = Math.max(0, terms.annualInterestRate) / 100 / 12;

  let accrued = 0;
  if (chargeableMonths > 0) {
    accrued =
      terms.interestType === "COMPOUND"
        ? principal * (Math.pow(1 + monthlyRate, chargeableMonths) - 1)
        : principal * monthlyRate * chargeableMonths;
  }

  const isOverdue = monthsElapsed > Math.max(0, terms.graceMonths);
  const penalInterest = isOverdue
    ? principal * (Math.max(0, terms.penaltyRate) / 100 / 12) * chargeableMonths
    : 0;

  const totalInterest = round2(accrued + penalInterest);
  const outstandingInterest = round2(Math.max(0, totalInterest - terms.interestPaid));
  const outstandingPrincipal = round2(Math.max(0, principal - terms.principalPaid));
  const amountDue = round2(outstandingPrincipal + outstandingInterest);

  return {
    monthsElapsed,
    chargeableMonths,
    interestAccrued: round2(accrued),
    penalInterest: round2(penalInterest),
    totalInterest,
    outstandingInterest,
    outstandingPrincipal,
    amountDue,
  };
}

// ─────────────────────────────── LTV risk monitoring ────────────────────────────

export interface LtvStatus {
  /** Live collateral value of the pledged metal at today's rate. */
  collateralValue: number;
  /** Loan-to-value as a percentage. */
  ltvPct: number;
  /** True once LTV breaches the configured alert threshold. */
  breached: boolean;
  severity: "SAFE" | "WATCH" | "CRITICAL";
}

/**
 * PRD Module 1: real-time LTV monitoring. As live rates fall the collateral
 * shrinks under a fixed loan, so this is recomputed whenever a rate updates —
 * at >75% the loan raises a warning, above 90% it is auction-critical.
 */
export function computeLtv(
  pledgedAmount: number,
  netWeight: number,
  ratePerGram: number,
): LtvStatus {
  const collateralValue = round2(Math.max(0, netWeight) * Math.max(0, ratePerGram));
  const ltvPct =
    collateralValue > 0 ? round2((Math.max(0, pledgedAmount) / collateralValue) * 100) : 0;
  const breached = ltvPct > LTV_ALERT_THRESHOLD_PCT;
  const severity: LtvStatus["severity"] =
    ltvPct > 90 ? "CRITICAL" : breached ? "WATCH" : "SAFE";
  return { collateralValue, ltvPct, breached, severity };
}

// ──────────────────────────────── karigar wastage ───────────────────────────────

export interface WastageResult {
  expectedFineMetal: number;
  actualFineMetal: number;
  wastageGrams: number;
  wastagePct: number;
  /** Wastage beyond the job card allowance — billed to the store. */
  excessGrams: number;
  withinAllowance: boolean;
}

function purityFactor(karat: number): number {
  if (karat >= 900) return karat / 1000;
  return karat / 24;
}

/**
 * PRD Module 4: compare fine metal issued against fine metal received.
 * Only the *fine* (pure) content matters — a 22K ornament returns 22/24 of its
 * weight as pure gold, so comparing raw gross weight would overstate wastage.
 */
export function computeWastage(input: {
  issuedWeight: number;
  issuedPurity: number;
  receivedWeight: number;
  receivedPurity: number;
  allowedWastagePct: number;
}): WastageResult {
  const expectedFineMetal = round3(input.issuedWeight * purityFactor(input.issuedPurity));
  const actualFineMetal = round3(input.receivedWeight * purityFactor(input.receivedPurity));
  const wastageGrams = round3(Math.max(0, expectedFineMetal - actualFineMetal));
  const wastagePct =
    expectedFineMetal > 0 ? round2((wastageGrams / expectedFineMetal) * 100) : 0;
  const excessGrams = round3(
    Math.max(0, wastageGrams - (expectedFineMetal * input.allowedWastagePct) / 100),
  );
  return {
    expectedFineMetal,
    actualFineMetal,
    wastageGrams,
    wastagePct,
    excessGrams,
    withinAllowance: excessGrams <= 0,
  };
}

// ──────────────────────────────────── RBAC ──────────────────────────────────────

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Platform Operator",
  STORE_OWNER: "Store Owner",
  SALES_STAFF: "Sales Staff",
  GIRVI_OPERATOR: "Girvi Operator",
  ACCOUNTANT: "Accountant",
};

/** Modules a role may open. Enforced in the UI and mirrored on the server. */
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: ["admin"],
  STORE_OWNER: [
    "dashboard",
    "pos",
    "inventory",
    "girvi",
    "karigar",
    "customers",
    "purchases",
    "reports",
    "team",
  ],
  // Costs, profit margins, GST reports and Girvi books are all hidden.
  SALES_STAFF: ["dashboard", "pos", "inventory", "customers"],
  GIRVI_OPERATOR: ["dashboard", "girvi", "customers"],
  // The accountant needs the POS for invoice and GST work, plus the purchase
  // register and financial reports.
  ACCOUNTANT: [
    "dashboard",
    "pos",
    "inventory",
    "karigar",
    "customers",
    "purchases",
    "reports",
    "team",
  ],
};

export function canAccess(role: Role | undefined, module: string): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(module) ?? false;
}

// ─────────────────────────────────── tenancy ────────────────────────────────────

/** Post-slug → PostgreSQL schema name, matching `tenant_<slug>_jewellers`. */
export function schemaNameFor(businessName: string): string {
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `tenant_${slug || "store"}`;
}

export function subdomainFor(businessName: string): string {
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return slug || "store";
}
