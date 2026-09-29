import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

/**
 * GehnaCloud role matrix (PRD §2).
 * SUPER_ADMIN  -> the platform operator on /admin (staff of GehnaCloud itself)
 * STORE_OWNER -> unrestricted: P&L, staff, Girvi interest setup, audit trails
 * SALES_STAFF  -> POS billing, catalog lookup, tag printing (costs hidden)
 * GIRVI_OPERATOR -> Girvi Jama / Chudai / interest / KYC only
 * ACCOUNTANT  -> GST reports, ledgers, URD purchases, Karigar balances
 */
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  STORE_OWNER: "STORE_OWNER",
  SALES_STAFF: "SALES_STAFF",
  GIRVI_OPERATOR: "GIRVI_OPERATOR",
  ACCOUNTANT: "ACCOUNTANT",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.SUPER_ADMIN),
  v.literal(ROLES.STORE_OWNER),
  v.literal(ROLES.SALES_STAFF),
  v.literal(ROLES.GIRVI_OPERATOR),
  v.literal(ROLES.ACCOUNTANT),
);
export type Role = Infer<typeof roleValidator>;

/** Every role that may operate inside a single tenant's schema. */
export const TENANT_ROLES = [
  ROLES.STORE_OWNER,
  ROLES.SALES_STAFF,
  ROLES.GIRVI_OPERATOR,
  ROLES.ACCOUNTANT,
] as const satisfies readonly Role[];

export const METALS = ["GOLD", "SILVER", "PLATINUM"] as const;
export const metalValidator = v.union(
  v.literal("GOLD"),
  v.literal("SILVER"),
  v.literal("PLATINUM"),
);

/** Per-gram rate keyed by (metal, purity). Purity is the karat/tunch value. */
export const purityValidator = v.union(
  v.literal(24),
  v.literal(22),
  v.literal(18),
  v.literal(14),
  v.literal(925), // silver fineness
  v.literal(950), // silver fineness
);

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ──────────────────────────── PUBLIC MASTER SCHEMA ────────────────────────────
    // Mirrors public.tenants / public.live_rates / public.users_master from the PRD.
    // In production each of these is a physically isolated PostgreSQL schema;
    // Convex gives us the same guarantee by keying every row on `tenantId` and
    // scoping every query through `requireMembership` (see convex/lib/rbac.ts).

    /** Tenant registration + lifecycle record. */
    tenants: defineTable({
      businessName: v.string(),
      /** PostgreSQL schema name this tenant would own, e.g. tenant_manglam_jewellers. */
      schemaName: v.string(),
      /** app.gehnacloud.com subdomain, e.g. manglam. */
      subdomain: v.string(),
      planTier: v.string(), // RETAIL_BASIC | WHOLESALE_PRO | GIRVI_ENTERPRISE
      status: v.string(), // ACTIVE | SUSPENDED | TRIAL | CHURNED
      ownerName: v.optional(v.string()),
      ownerEmail: v.optional(v.string()),
      phone: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      gstin: v.optional(v.string()),
      trialEndsAt: v.optional(v.number()),
      /** When the current paid period lapses and the licence needs renewing. */
      renewsAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("subdomain", ["subdomain"])
      .index("schemaName", ["schemaName"])
      .index("planTier", ["planTier"]),

    /** Link between an auth user and a tenant, carrying their role. */
    memberships: defineTable({
      tenantId: v.id("tenants"),
      userId: v.id("users"),
      role: roleValidator,
      name: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_tenant", ["tenantId"])
      .index("by_user", ["userId"]),

    /** Centralised live rate engine (PRD Portal 1 -> Global Rate Engine). */
    liveRates: defineTable({
      metalType: metalValidator,
      purityKarat: purityValidator,
      ratePerGram: v.number(),
      updatedAt: v.number(),
    })
      .index("by_metal", ["metalType"])
      .index("by_metal_purity", ["metalType", "purityKarat"]),

    /** SaaS subscription catalogue (tiered plans). */
    plans: defineTable({
      tier: v.string(),
      label: v.string(),
      monthlyPrice: v.number(),
      blurb: v.string(),
      features: v.array(v.string()),
      maxStaff: v.number(),
      maxItems: v.number(),
      girviEnabled: v.boolean(),
      active: v.boolean(),
    }).index("tier", ["tier"]),

    /** Immutable platform-wide audit trail. */
    auditLogs: defineTable({
      tenantId: v.optional(v.id("tenants")),
      actor: v.string(),
      action: v.string(),
      entity: v.string(),
      detail: v.optional(v.string()),
      at: v.number(),
    })
      .index("by_tenant", ["tenantId"])
      .index("by_at", ["at"]),

    // ──────────────────────────── TENANT-SCOPED TABLES ────────────────────────────

    /** Module 5 — customer CRM + Kitty (monthly gold savings) passbooks. */
    customers: defineTable({
      tenantId: v.id("tenants"),
      name: v.string(),
      phone: v.string(),
      email: v.optional(v.string()),
      aadhaarLast4: v.optional(v.string()),
      pan: v.optional(v.string()),
      /** B2B customers — required for a valid GSTR-1 outward supply row. */
      gstin: v.optional(v.string()),
      kycStatus: v.string(), // PENDING | VERIFIED | FAILED
      kycVerifiedAt: v.optional(v.number()),
      /** Kitty passbook */
      kittyActive: v.boolean(),
      kittyMonthlyGrams: v.number(),
      kittyPaidMonths: v.number(),
      /** Target months for the scheme to mature; drives redemption eligibility. */
      kittyMaturityMonths: v.optional(v.number()),
      /** Grams already redeemed out of the passbook. */
      kittyRedeemedGrams: v.optional(v.number()),
      totalPurchased: v.number(),
      createdAt: v.number(),
    })
      .index("by_tenant", ["tenantId"])
      .index("by_tenant_phone", ["tenantId", "phone"]),

    /** Module 2 — smart inventory, HUID, RFID. */
    inventoryItems: defineTable({
      tenantId: v.id("tenants"),
      itemName: v.string(),
      barcode: v.string(),
      rfidTag: v.optional(v.string()),
      /** 6-digit Hallmark Unique Identification, mandatory on every bill. */
      huidNumber: v.string(),
      category: v.string(), // BANGLE | NECKLACE | RING | ...
      metalType: metalValidator,
      purityKarat: purityValidator,
      grossWeight: v.number(),
      netWeight: v.number(),
      stoneWeight: v.number(),
      /** Gemstones tracked as first-class stock, not just a weight line. */
      gemstoneType: v.optional(v.string()), // DIAMOND | RUBY | EMERALD | SAPPHIRE | PEARL | AMETHYST
      gemstoneCarat: v.optional(v.number()),
      gemstoneClarity: v.optional(v.string()), // IF | VVS1 | VVS2 | VS | SI1 | SI2 | I
      gemstoneRatePerCarat: v.optional(v.number()),
      gemstoneCount: v.optional(v.number()),
      makingChargePerGram: v.number(),
      status: v.string(), // IN_STOCK | SOLD | PLEDGED_GIRVI | AUDITED
      purchaseRate: v.number(),
      addedAt: v.number(),
    })
      .index("by_tenant", ["tenantId"])
      .index("by_tenant_barcode", ["tenantId", "barcode"])
      .index("by_tenant_status", ["tenantId", "status"])
      .index("by_tenant_rfid", ["tenantId", "rfidTag"]),

    /** Module 1 — GehnaGirvi: loan lifecycle against pledged collateral. */
    girviLoans: defineTable({
      tenantId: v.id("tenants"),
      loanNumber: v.string(),
      customerId: v.id("customers"),
      metalType: metalValidator,
      purityKarat: purityValidator,
      grossWeight: v.number(),
      netWeight: v.number(),
      pledgedAmount: v.number(),
      /** Annual percentage rate, e.g. 1.5 => 1.5% p.a. */
      annualInterestRate: v.number(),
      interestType: v.string(), // SIMPLE | COMPOUND
      /** Months of interest waived from loan date (grace period). */
      graceMonths: v.number(),
      /** Penal rate applied once a loan falls overdue. */
      penaltyRate: v.number(),
      /** Interest that has already been collected against this loan. */
      interestPaid: v.number(),
      /** Principal repaid so far (full settlement sets status CLOSED). */
      principalPaid: v.number(),
      loanDate: v.number(),
      status: v.string(), // ACTIVE | CLOSED | AUCTIONED | OVERDUE
      kycStatus: v.string(), // PENDING | VERIFIED
      signatureCaptured: v.boolean(),
      /** Overdue escalation ladder: 0 none, 1 reminder, 2 notice, 3 auction. */
      escalationStage: v.optional(v.number()),
      auctionNoticeNumber: v.optional(v.string()),
      auctionNoticedAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_tenant", ["tenantId"])
      .index("by_tenant_status", ["tenantId", "status"])
      .index("by_customer", ["customerId"]),

    /** Repayments: Be-Cash partials, and final Chudai settlement. */
    girviPayments: defineTable({
      tenantId: v.id("tenants"),
      loanId: v.id("girviLoans"),
      /** INTEREST | PRINCIPAL | SETTLEMENT */
      kind: v.string(),
      amount: v.number(),
      mode: v.string(), // CASH | UPI | CARD | BANK
      note: v.optional(v.string()),
      /** Set on the final Chudai payment — the generated NOC. */
      nocNumber: v.optional(v.string()),
      at: v.number(),
    }).index("by_loan", ["loanId"]),

    /** Module 4 — Karigar (goldsmith) master. */
    karigars: defineTable({
      tenantId: v.id("tenants"),
      name: v.string(),
      phone: v.string(),
      specialty: v.optional(v.string()),
      /** Metal still in their custody (grams). */
      metalInHand: v.number(),
      /** Labour charges owed in cash (INR). */
      cashBalance: v.number(),
      createdAt: v.number(),
    }).index("by_tenant", ["tenantId"]),

    /** Job cards: fine metal issued vs finished ornaments received. */
    karigarJobs: defineTable({
      tenantId: v.id("tenants"),
      karigarId: v.id("karigars"),
      description: v.string(),
      issuedWeight: v.number(),
      issuedPurity: purityValidator,
      receivedWeight: v.optional(v.number()),
      receivedPurity: v.optional(purityValidator),
      /** Allowed wastage as a percentage of issued fine metal. */
      allowedWastagePct: v.number(),
      laborCharge: v.number(),
      status: v.string(), // ISSUED | RECEIVED
      dueDate: v.optional(v.number()),
      issuedAt: v.number(),
      receivedAt: v.optional(v.number()),
    })
      .index("by_tenant", ["tenantId"])
      .index("by_karigar", ["karigarId"]),

    /** Module 3 — URD (unregistered dealer) purchases and inward GST. */
    purchases: defineTable({
      tenantId: v.id("tenants"),
      purchaseNumber: v.string(),
      supplierName: v.string(),
      supplierGstin: v.optional(v.string()),
      /** An URD purchase attracts 3% but earns no input tax credit. */
      isUrd: v.boolean(),
      /** Counterfoil / bill number — mandatory evidence for a URD purchase. */
      billNumber: v.optional(v.string()),
      metalType: metalValidator,
      purityKarat: purityValidator,
      grossWeight: v.number(),
      netWeight: v.number(),
      taxableValue: v.number(),
      cgst: v.number(),
      sgst: v.number(),
      igst: v.number(),
      total: v.number(),
      /** Input tax credit actually claimable — always 0 for a URD. */
      itcClaimable: v.number(),
      mode: v.string(), // CASH | UPI | BANK
      createdAt: v.number(),
    })
      .index("by_tenant", ["tenantId"])
      .index("by_tenant_created", ["tenantId", "createdAt"]),

    /** Module 1 — KYC evidence: Aadhaar/PAN scans, pledge photos, signatures. */
    kycDocuments: defineTable({
      tenantId: v.id("tenants"),
      customerId: v.optional(v.id("customers")),
      loanId: v.optional(v.id("girviLoans")),
      kind: v.string(), // AADHAAR_FRONT | AADHAAR_BACK | PAN | PLEDGE_PHOTO | SIGNATURE
      /** Convex storage id for real file uploads. */
      storageId: v.optional(v.string()),
      /** Inline PNG drawn on the signature pad, stored as a data URL. */
      dataUrl: v.optional(v.string()),
      note: v.optional(v.string()),
      verified: v.boolean(),
      uploadedAt: v.number(),
    })
      .index("by_tenant", ["tenantId"])
      .index("by_loan", ["loanId"])
      .index("by_customer", ["customerId"]),

    /** Module 5 — Kitty redemptions once a passbook matures. */
    kittyRedemptions: defineTable({
      tenantId: v.id("tenants"),
      customerId: v.id("customers"),
      grams: v.number(),
      value: v.number(),
      /** Invoice raised against the redemption, if it was settled from stock. */
      invoiceId: v.optional(v.id("invoices")),
      note: v.optional(v.string()),
      at: v.number(),
    }).index("by_tenant", ["tenantId"]).index("by_customer", ["customerId"]),

    /** Module 5 — outbound WhatsApp Business dispatch log. */
    whatsappMessages: defineTable({
      tenantId: v.id("tenants"),
      customerId: v.optional(v.id("customers")),
      loanId: v.optional(v.id("girviLoans")),
      invoiceId: v.optional(v.id("invoices")),
      to: v.string(),
      kind: v.string(), // INVOICE | RECEIPT | INTEREST_DUE | AUCTION_NOTICE
      body: v.string(),
      status: v.string(), // SENT | FAILED | SKIPPED
      error: v.optional(v.string()),
      sentAt: v.number(),
    })
      .index("by_tenant", ["tenantId"])
      .index("by_tenant_sent", ["tenantId", "sentAt"]),

    /** Module 3 — POS invoices with GST + HUID compliance. */
    invoices: defineTable({
      tenantId: v.id("tenants"),
      invoiceNumber: v.string(),
      customerId: v.optional(v.id("customers")),
      customerName: v.string(),
      /** Recipient GSTIN — carried into the GSTR-1 CSV for B2B supplies. */
      gstin: v.optional(v.string()),
      /** Denormalised line items — each keeps its HUID for the audit trail. */
      lines: v.array(
        v.object({
          itemName: v.string(),
          huidNumber: v.string(),
          description: v.string(),
          purityKarat: v.number(),
          netWeight: v.number(),
          ratePerGram: v.number(),
          makingCharge: v.number(),
          stoneValue: v.number(),
          discount: v.number(),
          amount: v.number(),
          /** Cost of goods at purchase rate, so gross profit is real. */
          costValue: v.number(),
        }),
      ),
      taxableValue: v.number(),
      cgst: v.number(),
      sgst: v.number(),
      /** IGST is used when buyer and seller states differ. */
      igst: v.number(),
      grandTotal: v.number(),
      /** Multi-payment split, e.g. Cash + UPI + Old Gold Exchange. */
      splits: v.array(
        v.object({ mode: v.string(), amount: v.number() }),
      ),
      paymentMode: v.string(),
      createdAt: v.number(),
    })
      .index("by_tenant", ["tenantId"])
      .index("by_tenant_created", ["tenantId", "createdAt"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
