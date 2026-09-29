import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { actorLabel, audit, requireTenant } from "./lib/rbac";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{2}$/;

/**
 * Module 5 — Customer CRM & Kitty savings.
 *
 * A Kitty passbook is a monthly gold scheme: the customer buys a fixed gram
 * weight every month, we count the months, and at maturity the accumulated
 * fine metal is redeemable against stock.
 */
export const list = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { tenant } = await requireTenant(ctx, "customers");

    const [customers, rates] = await Promise.all([
      ctx.db
        .query("customers")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
      ctx.db.query("liveRates").collect(),
    ]);

    const gold22 = rates.find((r) => r.metalType === "GOLD" && r.purityKarat === 22)
      ?.ratePerGram ?? 0;

    const search = args.search?.trim().toLowerCase();
    const filtered = customers.filter(
      (c) =>
        !search ||
        c.name.toLowerCase().includes(search) ||
        c.phone.replace(/\s/g, "").includes(search.replace(/\s/g, "")),
    );

    const enriched = filtered.map((c) => {
      const accruedGrams = c.kittyMonthlyGrams * c.kittyPaidMonths;
      const redeemed = c.kittyRedeemedGrams ?? 0;
      /** Fine gold the passbook has accumulated, valued at today's 22K rate. */
      const kittyGrams = Math.round((accruedGrams - redeemed) * 1000) / 1000;
      const maturity = c.kittyMaturityMonths ?? 12;
      return {
        ...c,
        kittyGrams,
        kittyValue: Math.round(kittyGrams * gold22),
        kycPending: c.kycStatus !== "VERIFIED",
        maturityMonths: maturity,
        /** Months still to run before the passbook can be redeemed. */
        monthsToMaturity: Math.max(0, maturity - c.kittyPaidMonths),
        matured: c.kittyActive && c.kittyPaidMonths >= maturity,
      };
    });

    const kittyMembers = customers.filter((c) => c.kittyActive);

    return {
      customers: enriched.sort((a, b) => b.totalPurchased - a.totalPurchased),
      summary: {
        total: customers.length,
        kycPending: customers.filter((c) => c.kycStatus !== "VERIFIED").length,
        kittyMembers: kittyMembers.length,
        /** Gold committed to live kitty schemes, in grams. */
        kittyGramsOutstanding:
          Math.round(
            kittyMembers.reduce(
              (a, c) => a + c.kittyMonthlyGrams * c.kittyPaidMonths,
              0,
            ) * 1000,
          ) / 1000,
        lifetimeValue: customers.reduce((a, c) => a + c.totalPurchased, 0),
        maturedCount: enriched.filter((c) => c.matured).length,
        b2bCustomers: customers.filter((c) => c.gstin).length,
        avgOrder:
          customers.length > 0
            ? Math.round(
                customers.reduce((a, c) => a + c.totalPurchased, 0) / customers.length,
              )
            : 0,
      },
    };
  },
});

export const add = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    aadhaarLast4: v.optional(v.string()),
    pan: v.optional(v.string()),
    gstin: v.optional(v.string()),
    kittyActive: v.optional(v.boolean()),
    kittyMonthlyGrams: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { tenant, user, role } = await requireTenant(ctx, "customers");
    if (!args.name.trim()) throw new ConvexError("Customer name is required.");
    if (!/^\+?[\d\s-]{10,15}$/.test(args.phone)) {
      throw new ConvexError("Enter a valid phone number.");
    }
    if (args.aadhaarLast4 && !/^\d{4}$/.test(args.aadhaarLast4)) {
      throw new ConvexError("Aadhaar must be the last 4 digits only.");
    }
    void role;

    const dupe = await ctx.db
      .query("customers")
      .withIndex("by_tenant_phone", (q) =>
        q.eq("tenantId", tenant._id).eq("phone", args.phone),
      )
      .first();
    if (dupe) throw new ConvexError(`${dupe.name} already uses that number.`);

    const id = await ctx.db.insert("customers", {
      tenantId: tenant._id,
      name: args.name.trim(),
      phone: args.phone.trim(),
      email: args.email,
      // Only the last four digits are ever stored — KYC data stays masked.
      aadhaarLast4: args.aadhaarLast4,
      pan: args.pan?.toUpperCase(),
      gstin: args.gstin?.trim().toUpperCase() || undefined,
      kycStatus: "PENDING",
      kittyActive: args.kittyActive ?? false,
      kittyMonthlyGrams: args.kittyMonthlyGrams ?? 0,
      kittyPaidMonths: 0,
      totalPurchased: 0,
      createdAt: Date.now(),
    });

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "CUSTOMER_CREATED",
      entity: "customers",
      detail: `${args.name} — ${args.phone}.`,
    });

    return id;
  },
});

/** Record a monthly Kitty installment against a passbook. */
export const addKittyPayment = mutation({
  args: { customerId: v.id("customers"), amount: v.number() },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "customers");
    const customer = await ctx.db.get(args.customerId);
    if (!customer || customer.tenantId !== tenant._id) {
      throw new ConvexError("Customer not found.");
    }
    if (!customer.kittyActive) throw new ConvexError("This customer has no active Kitty scheme.");
    if (args.amount <= 0) throw new ConvexError("Installment must be positive.");

    await ctx.db.patch(args.customerId, {
      kittyPaidMonths: customer.kittyPaidMonths + 1,
      totalPurchased: customer.totalPurchased + args.amount,
    });

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "KITTY_INSTALLMENT",
      entity: "customers",
      detail: `${customer.name} — installment ${customer.kittyPaidMonths + 1}, ₹${args.amount}.`,
    });

    return customer.kittyPaidMonths + 1;
  },
});

/**
 * Redeem a matured Kitty passbook against stock. Only the un-redeemed
 * balance can be taken, and only once the scheme has run its full term.
 */
export const redeemKitty = mutation({
  args: {
    customerId: v.id("customers"),
    /** Grams to redeem; defaults to the whole outstanding balance. */
    grams: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "customers");
    const customer = await ctx.db.get(args.customerId);
    if (!customer || customer.tenantId !== tenant._id) {
      throw new ConvexError("Customer not found.");
    }
    if (!customer.kittyActive) throw new ConvexError("No active Kitty scheme on this passbook.");

    const maturity = customer.kittyMaturityMonths ?? 12;
    if (customer.kittyPaidMonths < maturity) {
      throw new ConvexError(
        `Passbook matures in ${maturity - customer.kittyPaidMonths} more month(s).`,
      );
    }

    const outstanding =
      customer.kittyMonthlyGrams * customer.kittyPaidMonths - (customer.kittyRedeemedGrams ?? 0);
    const grams = Math.round(Math.min(args.grams ?? outstanding, outstanding) * 1000) / 1000;
    if (grams <= 0) throw new ConvexError("Nothing left to redeem on this passbook.");

    const gold22 =
      (await ctx.db.query("liveRates").collect()).find(
        (r) => r.metalType === "GOLD" && r.purityKarat === 22,
      )?.ratePerGram ?? 0;
    const value = Math.round(grams * gold22);

    await ctx.db.insert("kittyRedemptions", {
      tenantId: tenant._id,
      customerId: args.customerId,
      grams,
      value,
      at: Date.now(),
    });

    await ctx.db.patch(args.customerId, {
      kittyRedeemedGrams: (customer.kittyRedeemedGrams ?? 0) + grams,
      totalPurchased: customer.totalPurchased + value,
    });

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "KITTY_REDEEMED",
      entity: "kittyRedemptions",
      detail: `${customer.name} redeemed ${grams}g (₹${value}) from the Kitty passbook.`,
    });

    return { grams, value, remaining: Math.round((outstanding - grams) * 1000) / 1000 };
  },
});

/** Register or correct a customer's GSTIN for B2B billing. */
export const setGstin = mutation({
  args: { customerId: v.id("customers"), gstin: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "customers");
    const customer = await ctx.db.get(args.customerId);
    if (!customer || customer.tenantId !== tenant._id) {
      throw new ConvexError("Customer not found.");
    }

    const gstin = args.gstin?.trim().toUpperCase() || undefined;
    if (gstin && !GSTIN_RE.test(gstin)) {
      throw new ConvexError("That does not look like a valid 15-character GSTIN.");
    }

    await ctx.db.patch(args.customerId, { gstin });

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "CUSTOMER_GSTIN_SET",
      entity: "customers",
      detail: `${customer.name} — GSTIN ${gstin ?? "cleared"}.`,
    });
    return true;
  },
});

/** Aadhaar OTP / PAN verification completed at the counter. */
export const verifyKyc = mutation({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "customers");
    const customer = await ctx.db.get(args.customerId);
    if (!customer || customer.tenantId !== tenant._id) {
      throw new ConvexError("Customer not found.");
    }
    if (!customer.aadhaarLast4 && !customer.pan) {
      throw new ConvexError("Add an Aadhaar last-4 or PAN before verifying.");
    }

    await ctx.db.patch(args.customerId, {
      kycStatus: "VERIFIED",
      kycVerifiedAt: Date.now(),
    });

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "KYC_VERIFIED",
      entity: "customers",
      detail: `${customer.name} verified.`,
    });
    return true;
  },
});
