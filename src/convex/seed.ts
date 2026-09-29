import { computeNetWeight } from "../lib/gehnacloud";
import { schemaNameFor, subdomainFor } from "../lib/gehnacloud";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const DAY = 86_400_000;

function daysAgo(n: number): number {
  return Date.now() - n * DAY;
}

function monthsAgo(n: number): number {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.getTime();
}

/**
 * Global rate board seeded into the public master schema (PRD
 * `public.live_rates`). The super admin can edit these from the rate engine
 * and every tenant's billing + LTV monitor picks the change up immediately.
 */
const RATE_BOARD: {
  metalType: "GOLD" | "SILVER" | "PLATINUM";
  purityKarat: 24 | 22 | 18 | 14 | 925 | 950;
  ratePerGram: number;
}[] = [
  { metalType: "GOLD", purityKarat: 24, ratePerGram: 98450 },
  { metalType: "GOLD", purityKarat: 22, ratePerGram: 90520 },
  { metalType: "GOLD", purityKarat: 18, ratePerGram: 74010 },
  { metalType: "GOLD", purityKarat: 14, ratePerGram: 57620 },
  { metalType: "SILVER", purityKarat: 925, ratePerGram: 112 },
  { metalType: "SILVER", purityKarat: 950, ratePerGram: 115 },
  { metalType: "PLATINUM", purityKarat: 950, ratePerGram: 9640 },
];

export async function ensureRates(ctx: MutationCtx): Promise<void> {
  if ((await ctx.db.query("liveRates").collect()).length > 0) return;
  const now = Date.now();
  for (const r of RATE_BOARD) {
    await ctx.db.insert("liveRates", { ...r, updatedAt: now });
  }
}

export const PLANS = [
  {
    tier: "RETAIL_BASIC",
    label: "Retail Basic",
    monthlyPrice: 2499,
    blurb: "Counter billing and stock for a single-outlet store.",
    features: [
      "POS billing with 3% GST",
      "HUID-tagged inventory (5,000 items)",
      "Thermal jewellery tags + QR",
      "Daily sales & stock reports",
    ],
    maxStaff: 3,
    maxItems: 5000,
    girviEnabled: false,
    active: true,
  },
  {
    tier: "WHOLESALE_PRO",
    label: "Wholesale Pro",
    monthlyPrice: 6499,
    blurb: "Metal accounting, Karigar ledgers and URD purchases.",
    features: [
      "Everything in Retail Basic",
      "Karigar issue/receive ledger + wastage",
      "GST / GSTR-1 & 3B export",
      "WhatsApp invoice dispatch",
      "25,000 items · 15 staff",
    ],
    maxStaff: 15,
    maxItems: 25000,
    girviEnabled: false,
    active: true,
  },
  {
    tier: "GIRVI_ENTERPRISE",
    label: "Girvi Enterprise",
    monthlyPrice: 14999,
    blurb: "Full pawn broking with LTV monitoring and auctions.",
    features: [
      "Everything in Wholesale Pro",
      "GehnaGirvi Jama, Be-Cash & Chudai",
      "Aadhaar KYC + digital signature",
      "Real-time LTV & auction alerts",
      "Unlimited items and branches",
    ],
    maxStaff: 100,
    maxItems: 250000,
    girviEnabled: true,
    active: true,
  },
];

/** Returns the seeded tenant, reusing it if a previous run already created it. */
export async function ensureDemoTenant(
  ctx: MutationCtx,
): Promise<Doc<"tenants">> {
  const existing = await ctx.db
    .query("tenants")
    .withIndex("subdomain", (q) => q.eq("subdomain", "manglam"))
    .unique();
  if (existing) return existing;

  const businessName = "Manglam Jewellers & Sons";
  const now = Date.now();
  const tenantId = await ctx.db.insert("tenants", {
    businessName,
    schemaName: schemaNameFor(businessName),
    subdomain: subdomainFor(businessName),
    planTier: "GIRVI_ENTERPRISE",
    status: "ACTIVE",
    ownerName: "Rajesh Manglam",
    ownerEmail: "rajesh@manglamjewellers.in",
    phone: "+91 98290 44121",
    city: "Jaipur",
    state: "Rajasthan",
    gstin: "08AABCM1234K1Z5",
    trialEndsAt: now + 60 * DAY,
    createdAt: now,
  });

  // ── Customers (Module 5: CRM + Kitty savings passbooks) ──────────────────────
  const customerSeed: {
    name: string;
    phone: string;
    kycStatus: string;
    aadhaarLast4?: string;
    pan?: string;
    kittyActive: boolean;
    kittyMonthlyGrams: number;
    kittyPaidMonths: number;
    totalPurchased: number;
  }[] = [
    { name: "Sunita Sharma", phone: "+91 98290 11223", kycStatus: "VERIFIED", aadhaarLast4: "4412", pan: "ABCPS4412K", kittyActive: true, kittyMonthlyGrams: 5, kittyPaidMonths: 7, totalPurchased: 412500 },
    { name: "Mohammed Irfan", phone: "+91 94140 55678", kycStatus: "VERIFIED", aadhaarLast4: "9031", kittyActive: false, kittyMonthlyGrams: 0, kittyPaidMonths: 0, totalPurchased: 288000 },
    { name: "Kamala Devi", phone: "+91 99280 33445", kycStatus: "PENDING", kittyActive: true, kittyMonthlyGrams: 3, kittyPaidMonths: 4, totalPurchased: 154000 },
    { name: "Anil Soni", phone: "+91 90010 77889", kycStatus: "VERIFIED", aadhaarLast4: "2277", pan: "AAPSX2277L", kittyActive: false, kittyMonthlyGrams: 0, kittyPaidMonths: 0, totalPurchased: 96000 },
    { name: "Rekha Agarwal", phone: "+91 98260 66554", kycStatus: "VERIFIED", aadhaarLast4: "8810", kittyActive: true, kittyMonthlyGrams: 10, kittyPaidMonths: 11, totalPurchased: 733000 },
    { name: "Vikram Singh", phone: "+91 93140 22331", kycStatus: "PENDING", kittyActive: false, kittyMonthlyGrams: 0, kittyPaidMonths: 0, totalPurchased: 42000 },
    { name: "Pooja Bhandari", phone: "+91 97110 99002", kycStatus: "VERIFIED", aadhaarLast4: "5567", kittyActive: false, kittyMonthlyGrams: 0, kittyPaidMonths: 0, totalPurchased: 205500 },
    { name: "Gopal Lal", phone: "+91 98990 44512", kycStatus: "VERIFIED", aadhaarLast4: "1104", kittyActive: true, kittyMonthlyGrams: 2, kittyPaidMonths: 3, totalPurchased: 88000 },
  ];

  const customerIds: Id<"customers">[] = [];
  for (const c of customerSeed) {
    customerIds.push(
      await ctx.db.insert("customers", {
        tenantId,
        name: c.name,
        phone: c.phone,
        kycStatus: c.kycStatus,
        aadhaarLast4: c.aadhaarLast4,
        pan: c.pan,
        kycVerifiedAt: c.kycStatus === "VERIFIED" ? daysAgo(90) : undefined,
        kittyActive: c.kittyActive,
        kittyMonthlyGrams: c.kittyMonthlyGrams,
        kittyPaidMonths: c.kittyPaidMonths,
        totalPurchased: c.totalPurchased,
        createdAt: daysAgo(400),
      }),
    );
  }

  // ── Inventory (Module 2: HUID, RFID, gross/net weight) ───────────────────────
  const itemSeed: {
    itemName: string;
    category: string;
    metalType: "GOLD" | "SILVER";
    purityKarat: 24 | 22 | 18 | 925;
    grossWeight: number;
    stoneWeight: number;
    makingChargePerGram: number;
    status: string;
    purchaseRate: number;
  }[] = [
    { itemName: "Kundan Polki Necklace", category: "NECKLACE", metalType: "GOLD", purityKarat: 22, grossWeight: 42.85, stoneWeight: 6.4, makingChargePerGram: 850, status: "IN_STOCK", purchaseRate: 86200 },
    { itemName: "Temple Choker", category: "NECKLACE", metalType: "GOLD", purityKarat: 22, grossWeight: 31.2, stoneWeight: 4.1, makingChargePerGram: 1100, status: "IN_STOCK", purchaseRate: 85800 },
    { itemName: "Diamond Ring 0.42ct", category: "RING", metalType: "GOLD", purityKarat: 18, grossWeight: 4.16, stoneWeight: 0.42, makingChargePerGram: 2400, status: "IN_STOCK", purchaseRate: 71200 },
    { itemName: "Emerald Halo Ring", category: "RING", metalType: "GOLD", purityKarat: 18, grossWeight: 6.04, stoneWeight: 1.18, makingChargePerGram: 2100, status: "IN_STOCK", purchaseRate: 71500 },
    { itemName: "Slim Gold Bangle", category: "BANGLE", metalType: "GOLD", purityKarat: 22, grossWeight: 18.44, stoneWeight: 0, makingChargePerGram: 620, status: "IN_STOCK", purchaseRate: 86000 },
    { itemName: "Kada Bangle Pair", category: "BANGLE", metalType: "GOLD", purityKarat: 22, grossWeight: 62.1, stoneWeight: 0, makingChargePerGram: 700, status: "IN_STOCK", purchaseRate: 86400 },
    { itemName: "Zircon Bangles (Set of 12)", category: "BANGLE", metalType: "GOLD", purityKarat: 18, grossWeight: 96.3, stoneWeight: 9.8, makingChargePerGram: 480, status: "IN_STOCK", purchaseRate: 70900 },
    { itemName: "Mangalsutra 3M", category: "PENDANT", metalType: "GOLD", purityKarat: 22, grossWeight: 8.12, stoneWeight: 0.06, makingChargePerGram: 1450, status: "SOLD", purchaseRate: 86100 },
    { itemName: "Gold Coin 10g", category: "COIN", metalType: "GOLD", purityKarat: 24, grossWeight: 10.0, stoneWeight: 0, makingChargePerGram: 350, status: "IN_STOCK", purchaseRate: 87900 },
    { itemName: "Silver Coin 50g", category: "COIN", metalType: "SILVER", purityKarat: 925, grossWeight: 50.0, stoneWeight: 0, makingChargePerGram: 12, status: "IN_STOCK", purchaseRate: 96 },
    { itemName: "Rani Haar Necklace", category: "NECKLACE", metalType: "GOLD", purityKarat: 22, grossWeight: 55.9, stoneWeight: 11.2, makingChargePerGram: 980, status: "IN_STOCK", purchaseRate: 85900 },
    { itemName: "Navratna Choker", category: "NECKLACE", metalType: "GOLD", purityKarat: 22, grossWeight: 28.75, stoneWeight: 5.9, makingChargePerGram: 1250, status: "IN_STOCK", purchaseRate: 86050 },
    { itemName: "Rose Gold Band", category: "RING", metalType: "GOLD", purityKarat: 18, grossWeight: 3.24, stoneWeight: 0, makingChargePerGram: 1300, status: "IN_STOCK", purchaseRate: 71300 },
    { itemName: "Antique Chain 24in", category: "CHAIN", metalType: "GOLD", purityKarat: 22, grossWeight: 22.4, stoneWeight: 0, makingChargePerGram: 820, status: "IN_STOCK", purchaseRate: 86250 },
    { itemName: "Rupi Mala 27in", category: "CHAIN", metalType: "GOLD", purityKarat: 22, grossWeight: 34.6, stoneWeight: 0, makingChargePerGram: 760, status: "IN_STOCK", purchaseRate: 86100 },
    { itemName: "Silver Payal Pair", category: "BANGLE", metalType: "SILVER", purityKarat: 925, grossWeight: 148.0, stoneWeight: 0, makingChargePerGram: 18, status: "IN_STOCK", purchaseRate: 94 },
    { itemName: "Oxidised Silver Jhumka", category: "EARRING", metalType: "SILVER", purityKarat: 925, grossWeight: 26.8, stoneWeight: 2.1, makingChargePerGram: 22, status: "IN_STOCK", purchaseRate: 93 },
    { itemName: "Pearl Choker", category: "NECKLACE", metalType: "GOLD", purityKarat: 18, grossWeight: 19.45, stoneWeight: 3.2, makingChargePerGram: 1050, status: "IN_STOCK", purchaseRate: 70800 },
    { itemName: "Baby Chain 14in", category: "CHAIN", metalType: "GOLD", purityKarat: 22, grossWeight: 9.85, stoneWeight: 0, makingChargePerGram: 900, status: "IN_STOCK", purchaseRate: 86100 },
    { itemName: "Bridal Lehenga Set", category: "SET", metalType: "GOLD", purityKarat: 22, grossWeight: 186.4, stoneWeight: 28.6, makingChargePerGram: 1150, status: "IN_STOCK", purchaseRate: 86400 },
    { itemName: "Gifter Ring", category: "RING", metalType: "GOLD", purityKarat: 22, grossWeight: 5.6, stoneWeight: 0, makingChargePerGram: 1500, status: "SOLD", purchaseRate: 86200 },
    { itemName: "Temple Earrings", category: "EARRING", metalType: "GOLD", purityKarat: 22, grossWeight: 11.3, stoneWeight: 1.9, makingChargePerGram: 1350, status: "IN_STOCK", purchaseRate: 86000 },
    { itemName: "Gold Chain 30in", category: "CHAIN", metalType: "GOLD", purityKarat: 22, grossWeight: 27.15, stoneWeight: 0, makingChargePerGram: 790, status: "PLEDGED_GIRVI", purchaseRate: 86150 },
    { itemName: "Silver Necklace Set", category: "SET", metalType: "SILVER", purityKarat: 925, grossWeight: 92.4, stoneWeight: 4.2, makingChargePerGram: 20, status: "IN_STOCK", purchaseRate: 95 },
  ];

  let seq = 0;
  for (const it of itemSeed) {
    seq += 1;
    const { netWeight } = computeNetWeight({
      grossWeight: it.grossWeight,
      stoneWeight: it.stoneWeight,
      enamelWeight: 0,
    });
    await ctx.db.insert("inventoryItems", {
      tenantId,
      itemName: it.itemName,
      barcode: `MNG${String(100000 + seq * 7)}`,
      rfidTag: `RFID-${String(70000 + seq * 3)}`,
      huidNumber: String(600000 + seq * 137).slice(0, 6),
      category: it.category,
      metalType: it.metalType,
      purityKarat: it.purityKarat,
      grossWeight: it.grossWeight,
      netWeight,
      stoneWeight: it.stoneWeight,
      makingChargePerGram: it.makingChargePerGram,
      status: it.status,
      purchaseRate: it.purchaseRate,
      addedAt: daysAgo(200 - seq),
    });
  }

  // ── Karigars + job cards (Module 4) ──────────────────────────────────────────
  const karigarSeed: {
    name: string;
    phone: string;
    specialty: string;
    metalInHand: number;
    cashBalance: number;
  }[] = [
    { name: "Rameshwar Bhai", phone: "+91 98290 61200", specialty: "Kundan & polki setting", metalInHand: 128.4, cashBalance: 18400 },
    { name: "Suresh Kumar", phone: "+91 94141 33900", specialty: "Modern chains & bangles", metalInHand: 74.2, cashBalance: 9250 },
    { name: "Nazir Sheikh", phone: "+91 99280 77120", specialty: "Silver oxidised & jhumka", metalInHand: 210.6, cashBalance: 14300 },
    { name: "Prakash Mali", phone: "+91 90015 44880", specialty: "Diamond setting & hallmarking", metalInHand: 41.9, cashBalance: 6700 },
  ];

  const karigarIds: Id<"karigars">[] = [];
  for (const k of karigarSeed) {
    karigarIds.push(
      await ctx.db.insert("karigars", {
        tenantId,
        name: k.name,
        phone: k.phone,
        specialty: k.specialty,
        metalInHand: k.metalInHand,
        cashBalance: k.cashBalance,
        createdAt: daysAgo(500),
      }),
    );
  }

  const jobSeed: {
    karigar: number;
    description: string;
    issuedWeight: number;
    issuedPurity: 22 | 18;
    receivedWeight?: number;
    receivedPurity?: 22 | 18;
    allowedWastagePct: number;
    laborCharge: number;
    status: string;
    issuedDaysAgo: number;
    receivedDaysAgo?: number;
  }[] = [
    { karigar: 0, description: "Kundan Polki Necklace — 42.85g gross", issuedWeight: 40.0, issuedPurity: 22, receivedWeight: 39.2, receivedPurity: 22, allowedWastagePct: 2.5, laborCharge: 21000, status: "RECEIVED", issuedDaysAgo: 48, receivedDaysAgo: 33 },
    { karigar: 0, description: "Navratna Choker — 28.75g gross", issuedWeight: 26.5, issuedPurity: 22, allowedWastagePct: 2.5, laborCharge: 16500, status: "ISSUED", issuedDaysAgo: 12 },
    { karigar: 1, description: "Kada Bangle Pair — 62.1g gross", issuedWeight: 58.0, issuedPurity: 22, receivedWeight: 57.4, receivedPurity: 22, allowedWastagePct: 3, laborCharge: 24800, status: "RECEIVED", issuedDaysAgo: 62, receivedDaysAgo: 44 },
    { karigar: 2, description: "Silver Payal Pair — 148g gross", issuedWeight: 140.0, issuedPurity: 22, allowedWastagePct: 4, laborCharge: 18600, status: "ISSUED", issuedDaysAgo: 20 },
    { karigar: 3, description: "Bridal Lehenga Set — 186.4g gross", issuedWeight: 172.0, issuedPurity: 22, receivedWeight: 170.1, receivedPurity: 22, allowedWastagePct: 2, laborCharge: 42000, status: "RECEIVED", issuedDaysAgo: 80, receivedDaysAgo: 55 },
  ];

  for (const j of jobSeed) {
    await ctx.db.insert("karigarJobs", {
      tenantId,
      karigarId: karigarIds[j.karigar],
      description: j.description,
      issuedWeight: j.issuedWeight,
      issuedPurity: j.issuedPurity,
      receivedWeight: j.receivedWeight,
      receivedPurity: j.receivedPurity,
      allowedWastagePct: j.allowedWastagePct,
      laborCharge: j.laborCharge,
      status: j.status,
      issuedAt: daysAgo(j.issuedDaysAgo),
      receivedAt: j.receivedDaysAgo ? daysAgo(j.receivedDaysAgo) : undefined,
    });
  }

  // ── GehnaGirvi loans (Module 1) ──────────────────────────────────────────────
  const loanSeed: {
    customer: number;
    grossWeight: number;
    netWeight: number;
    metalType: "GOLD" | "SILVER";
    purityKarat: 22 | 925;
    pledgedAmount: number;
    rate: number;
    type: "SIMPLE" | "COMPOUND";
    grace: number;
    months: number;
    status: string;
    interestPaid: number;
    principalPaid: number;
    kyc: string;
    signature: boolean;
  }[] = [
    { customer: 0, grossWeight: 52.4, netWeight: 51.8, metalType: "GOLD", purityKarat: 22, pledgedAmount: 220000, rate: 1.2, type: "SIMPLE", grace: 1, months: 4, status: "ACTIVE", interestPaid: 2640, principalPaid: 0, kyc: "VERIFIED", signature: true },
    { customer: 1, grossWeight: 86.2, netWeight: 84.0, metalType: "GOLD", purityKarat: 22, pledgedAmount: 340000, rate: 1.5, type: "COMPOUND", grace: 1, months: 7, status: "OVERDUE", interestPaid: 0, principalPaid: 50000, kyc: "VERIFIED", signature: true },
    { customer: 2, grossWeight: 38.6, netWeight: 38.1, metalType: "GOLD", purityKarat: 22, pledgedAmount: 165000, rate: 1.2, type: "SIMPLE", grace: 1, months: 2, status: "ACTIVE", interestPaid: 1650, principalPaid: 0, kyc: "PENDING", signature: false },
    { customer: 4, grossWeight: 148.9, netWeight: 146.5, metalType: "GOLD", purityKarat: 22, pledgedAmount: 620000, rate: 1.35, type: "SIMPLE", grace: 0, months: 9, status: "OVERDUE", interestPaid: 12000, principalPaid: 150000, kyc: "VERIFIED", signature: true },
    { customer: 6, grossWeight: 24.1, netWeight: 23.6, metalType: "GOLD", purityKarat: 22, pledgedAmount: 98000, rate: 1.5, type: "COMPOUND", grace: 1, months: 5, status: "ACTIVE", interestPaid: 3062, principalPaid: 0, kyc: "VERIFIED", signature: true },
    { customer: 5, grossWeight: 320.0, netWeight: 315.0, metalType: "SILVER", purityKarat: 925, pledgedAmount: 150000, rate: 1.8, type: "SIMPLE", grace: 1, months: 3, status: "ACTIVE", interestPaid: 2250, principalPaid: 0, kyc: "VERIFIED", signature: true },
    { customer: 7, grossWeight: 27.4, netWeight: 27.1, metalType: "GOLD", purityKarat: 22, pledgedAmount: 64000, rate: 1.2, type: "SIMPLE", grace: 1, months: 1, status: "CLOSED", interestPaid: 640, principalPaid: 64000, kyc: "VERIFIED", signature: true },
  ];

  for (let i = 0; i < loanSeed.length; i += 1) {
    const l = loanSeed[i];
    const loanId = await ctx.db.insert("girviLoans", {
      tenantId,
      loanNumber: `GRV-2026-${String(i + 1).padStart(4, "0")}`,
      customerId: customerIds[l.customer],
      metalType: l.metalType,
      purityKarat: l.purityKarat,
      grossWeight: l.grossWeight,
      netWeight: l.netWeight,
      pledgedAmount: l.pledgedAmount,
      annualInterestRate: l.rate,
      interestType: l.type,
      graceMonths: l.grace,
      penaltyRate: l.rate + 0.75,
      interestPaid: l.interestPaid,
      principalPaid: l.principalPaid,
      loanDate: monthsAgo(l.months),
      status: l.status,
      kycStatus: l.kyc,
      signatureCaptured: l.signature,
      createdAt: monthsAgo(l.months),
    });

    // A couple of historical Be-Cash entries so the ledger isn't empty.
    if (l.interestPaid > 0) {
      await ctx.db.insert("girviPayments", {
        tenantId,
        loanId,
        kind: "INTEREST",
        amount: l.interestPaid,
        mode: "CASH",
        note: "Be-Cash — interest collected at counter",
        at: daysAgo(20 + i * 4),
      });
    }
    if (l.principalPaid > 0) {
      await ctx.db.insert("girviPayments", {
        tenantId,
        loanId,
        kind: "PRINCIPAL",
        amount: l.principalPaid,
        mode: "UPI",
        note: l.status === "CLOSED" ? "Chudai settlement — NOC issued" : "Partial principal",
        nocNumber: l.status === "CLOSED" ? `NOC-${String(i + 1).padStart(4, "0")}` : undefined,
        at: daysAgo(15 + i * 3),
      });
    }
  }

  return (await ctx.db.get(tenantId))!;
}

export async function ensurePlans(ctx: MutationCtx): Promise<void> {
  if ((await ctx.db.query("plans").collect()).length > 0) return;
  for (const p of PLANS) await ctx.db.insert("plans", p);
}
