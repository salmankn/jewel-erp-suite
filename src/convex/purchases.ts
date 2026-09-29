import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { actorLabel, audit, requireTenant } from "./lib/rbac";
import { metalValidator, purityValidator } from "./schema";
import { computeGst, computeNetWeight } from "../lib/gehnacloud";
import type { Doc } from "./_generated/dataModel";

const round = (n: number) => Math.round(n * 100) / 100;

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{2}$/;

/**
 * Module 3 — inward supplies.
 *
 * Two very different beasts land here:
 *  • a registered dealer purchase — claim 3% as input tax credit
 *  • a URD (Unregistered Dealer) purchase — 3% is levied but is *not*
 *    recoverable; it becomes part of the buyer's cost. Section 17(5).
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { tenant } = await requireTenant(ctx, "purchases");

    const [purchases, rates] = await Promise.all([
      ctx.db
        .query("purchases")
        .withIndex("by_tenant_created", (q) => q.eq("tenantId", tenant._id))
        .collect(),
      ctx.db.query("liveRates").collect(),
    ]);

    const sorted = purchases.sort((a, b) => b.createdAt - a.createdAt);
    const rateByKey = new Map(
      rates.map((r) => [`${r.metalType}:${r.purityKarat}`, r.ratePerGram]),
    );

    return {
      purchases: sorted.map((p) => ({
        ...p,
        /** Live mark-to-market of the metal received. */
        metalValueNow: round(p.netWeight * (rateByKey.get(`${p.metalType}:${p.purityKarat}`) ?? 0)),
      })),
      summary: {
        count: purchases.length,
        totalSpend: round(purchases.reduce((a, p) => a + p.total, 0)),
        urdCount: purchases.filter((p) => p.isUrd).length,
        urdSpend: round(purchases.filter((p) => p.isUrd).reduce((a, p) => a + p.total, 0)),
        itcClaimable: round(purchases.reduce((a, p) => a + p.itcClaimable, 0)),
        metalReceived: round(purchases.reduce((a, p) => a + p.netWeight, 0)),
      },
    };
  },
});

export const create = mutation({
  args: {
    supplierName: v.string(),
    supplierGstin: v.optional(v.string()),
    isUrd: v.boolean(),
    billNumber: v.optional(v.string()),
    metalType: metalValidator,
    purityKarat: purityValidator,
    grossWeight: v.number(),
    stoneWeight: v.optional(v.number()),
    /** Purchase value before tax — the rate the dealer settled at. */
    taxableValue: v.number(),
    interState: v.optional(v.boolean()),
    mode: v.union(v.literal("CASH"), v.literal("UPI"), v.literal("BANK")),
  },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "purchases");

    if (!args.supplierName.trim()) throw new ConvexError("Supplier name is required.");
    if (args.taxableValue <= 0) throw new ConvexError("Purchase value must be positive.");

    const gstin = args.supplierGstin?.trim().toUpperCase() || undefined;

    // A registered dealer must have a valid GSTIN or be marked URD — you
    // cannot claim input credit on an invoice without one.
    if (args.isUrd) {
      if (!args.billNumber?.trim()) {
        throw new ConvexError(
          "A URD purchase needs the dealer's counterfoil / bill number as evidence.",
        );
      }
      if (gstin) {
        throw new ConvexError(
          "This supplier has a GSTIN, so the purchase is not a URD purchase.",
        );
      }
    } else if (!gstin || !GSTIN_RE.test(gstin)) {
      throw new ConvexError(
        "Enter a valid 15-character GSTIN, or tick this as an unregistered dealer.",
      );
    }

    const { netWeight } = computeNetWeight({
      grossWeight: args.grossWeight,
      stoneWeight: args.stoneWeight,
    });
    if (netWeight <= 0) throw new ConvexError("Net weight must be positive.");

    const gst = computeGst(args.taxableValue, args.interState ?? false);

    const count = await ctx.db
      .query("purchases")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
      .collect();

    const purchaseNumber = `PUR-${new Date().getFullYear()}-${String(count.length + 1).padStart(5, "0")}`;

    const id = await ctx.db.insert("purchases", {
      tenantId: tenant._id,
      purchaseNumber,
      supplierName: args.supplierName.trim(),
      supplierGstin: gstin,
      isUrd: args.isUrd,
      billNumber: args.billNumber?.trim() || undefined,
      metalType: args.metalType,
      purityKarat: args.purityKarat,
      grossWeight: args.grossWeight,
      netWeight,
      taxableValue: gst.taxableValue,
      cgst: gst.cgst,
      sgst: gst.sgst,
      igst: gst.igst,
      total: gst.total,
      // Section 17(5): no input credit on URD purchases.
      itcClaimable: args.isUrd ? 0 : round(gst.cgst + gst.sgst + gst.igst),
      mode: args.mode,
      createdAt: Date.now(),
    });

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: args.isUrd ? "URD_PURCHASE" : "PURCHASE_RECORDED",
      entity: "purchases",
      detail: `${purchaseNumber} — ${netWeight}g from ${args.supplierName} · ₹${gst.total}${args.isUrd ? " (URD, no ITC)" : ` (ITC ₹${round(gst.cgst + gst.sgst + gst.igst)})`}`,
    });

    return {
      id,
      purchaseNumber,
      total: gst.total,
      itcClaimable: args.isUrd ? 0 : round(gst.cgst + gst.sgst + gst.igst),
    };
  },
});

/** GSTR-3B inward supplies (Table 4) for the accountant. */
export const inwardSummary = query({
  args: {},
  handler: async (ctx) => {
    const { tenant } = await requireTenant(ctx, "purchases");

    const purchases = await ctx.db
      .query("purchases")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
      .collect();

    const registered = purchases.filter((p) => !p.isUrd);
    const urd = purchases.filter((p) => p.isUrd);

    return {
      byGstin: registered
        .filter((p) => p.supplierGstin)
        .reduce<Record<string, { name: string; taxable: number; itc: number }>>(
          (acc, p) => {
            const key = p.supplierGstin!;
            acc[key] = acc[key] ?? { name: p.supplierName, taxable: 0, itc: 0 };
            acc[key].taxable = round(acc[key].taxable + p.taxableValue);
            acc[key].itc = round(acc[key].itc + p.itcClaimable);
            return acc;
          },
          {},
        ),
      table4: {
        /** Purchases from registered suppliers. */
        b2b: {
          taxableValue: round(registered.reduce((a, p) => a + p.taxableValue, 0)),
          itc: round(registered.reduce((a, p) => a + p.itcClaimable, 0)),
        },
        /** Unregistered dealer purchases — tax paid, credit not available. */
        urd: {
          taxableValue: round(urd.reduce((a, p) => a + p.taxableValue, 0)),
          taxPaid: round(urd.reduce((a, p) => a + p.cgst + p.sgst + p.igst, 0)),
          itc: 0,
        },
      },
    };
  },
});
