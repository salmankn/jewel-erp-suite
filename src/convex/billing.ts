import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { actorLabel, audit, requireTenant } from "./lib/rbac";
import { computeGst, priceLine, validateSplits } from "../lib/gehnacloud";
import { ROLES } from "./schema";

/** Roles allowed to see GST returns and margins. */
function canSeeMoney(role: string): boolean {
  return role === ROLES.STORE_OWNER || role === ROLES.ACCOUNTANT;
}

const lineValidator = v.object({
  itemId: v.optional(v.id("inventoryItems")),
  itemName: v.string(),
  description: v.string(),
  /** Mandatory on every jewellery invoice line. */
  huidNumber: v.string(),
  purityKarat: v.number(),
  netWeight: v.number(),
  makingChargePerGram: v.number(),
  stoneValue: v.number(),
  discountPct: v.number(),
});

/** Module 3 — POS billing, HUID compliance and GST settlement. */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    const { tenant, role } = await requireTenant(ctx, "pos");

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_tenant_created", (q) => q.eq("tenantId", tenant._id))
      .collect();

    const sorted = invoices.sort((a, b) => b.createdAt - a.createdAt).slice(0, 40);

    return {
      invoices: sorted.map((inv) => ({
        ...inv,
        lineCount: inv.lines.length,
      })),
      // Sales staff get the list but the UI keeps GST and cost figures out of
      // reach; the server refuses those fields entirely for the GST report.
      showMoney: canSeeMoney(role),
      summary: {
        count: invoices.length,
        revenue: invoices.reduce((a, i) => a + i.grandTotal, 0),
        gstCollected: invoices.reduce((a, i) => a + i.cgst + i.sgst + i.igst, 0),
      },
    };
  },
});

/** GSTR-1 / GSTR-3B export. Cost and tax detail is accountant-and-owner only. */
export const gstReport = query({
  args: {},
  handler: async (ctx) => {
    const { tenant, role } = await requireTenant(ctx, "pos");
    if (!canSeeMoney(role)) {
      throw new ConvexError("GST reports are restricted to the Accountant and Store Owner.");
    }

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
      .collect();

    return {
      // GSTR-1: outward supplies.
      b2b: invoices.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        date: inv.createdAt,
        customerName: inv.customerName,
        taxableValue: inv.taxableValue,
        cgst: inv.cgst,
        sgst: inv.sgst,
        igst: inv.igst,
        total: inv.grandTotal,
      })),
      // GSTR-3B summary.
      summary3B: {
        taxableValue: invoices.reduce((a, i) => a + i.taxableValue, 0),
        cgst: invoices.reduce((a, i) => a + i.cgst, 0),
        sgst: invoices.reduce((a, i) => a + i.sgst, 0),
        igst: invoices.reduce((a, i) => a + i.igst, 0),
        totalTax: invoices.reduce((a, i) => a + i.cgst + i.sgst + i.igst, 0),
        invoiceCount: invoices.length,
      },
    };
  },
});

/**
 * Create an invoice.
 *
 * Every line is re-priced server-side from the live rate board — the browser's
 * preview is a convenience, never the source of truth. HUID is mandatory, and
 * the split settlement must reconcile exactly to the grand total.
 */
export const createInvoice = mutation({
  args: {
    customerId: v.optional(v.id("customers")),
    customerName: v.string(),
    gstin: v.optional(v.string()),
    interState: v.optional(v.boolean()),
    lines: v.array(lineValidator),
    splits: v.array(v.object({ mode: v.string(), amount: v.number() })),
  },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "pos");

    if (args.lines.length === 0) throw new ConvexError("Add at least one line item.");
    if (!args.customerName.trim()) throw new ConvexError("Customer name is required.");

    const rates = await ctx.db.query("liveRates").collect();
    const rateFor = (purity: number) => {
      const hit = rates.find((r) => r.purityKarat === purity && r.metalType !== "PLATINUM");
      return hit?.ratePerGram ?? 0;
    };

    // Purchase rates drive gross margin on the P&L, so carry cost onto the line.
    const stockItems = (
      await Promise.all(
        args.lines
          .map((l) => l.itemId)
          .filter((id): id is NonNullable<typeof id> => !!id)
          .map((id) => ctx.db.get(id)),
      )
    ).filter((i) => i && i.tenantId === tenant._id);
    const costById = new Map(stockItems.map((i) => [i!._id, i!.purchaseRate]));

    const pricedLines = args.lines.map((line) => {
      // Hallmark compliance: refuse a jewellery line with no HUID.
      if (!/^\d{6}$/.test(line.huidNumber)) {
        throw new ConvexError(
          `"${line.itemName}" is missing a valid 6-digit HUID. Hallmark compliance requires one per item.`,
        );
      }
      if (line.netWeight <= 0) throw new ConvexError(`${line.itemName}: net weight must be positive.`);

      const ratePerGram = rateFor(line.purityKarat);
      if (ratePerGram <= 0) {
        throw new ConvexError(`No live rate published for ${line.purityKarat}.`);
      }

      const priced = priceLine({
        netWeight: line.netWeight,
        ratePerGram,
        makingChargePerGram: line.makingChargePerGram,
        stoneValue: line.stoneValue,
        discountPct: line.discountPct,
      });

      return {
        itemName: line.itemName,
        huidNumber: line.huidNumber,
        description: line.description,
        purityKarat: line.purityKarat,
        netWeight: line.netWeight,
        ratePerGram,
        makingCharge: priced.makingCharge,
        stoneValue: line.stoneValue,
        discount: priced.discount,
        amount: priced.amount,
        costValue: line.itemId
          ? Math.round(line.netWeight * (costById.get(line.itemId) ?? 0) * 100) / 100
          : 0,
      };
    });

    const taxableValue = pricedLines.reduce((a, l) => a + l.amount, 0);
    const gst = computeGst(taxableValue, args.interState ?? false);

    const check = validateSplits(args.splits, gst.total);
    if (!check.ok) throw new ConvexError(check.message ?? "Payment does not reconcile.");

    const count = await ctx.db
      .query("invoices")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
      .collect();

    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count.length + 1).padStart(5, "0")}`;

    const invoiceId = await ctx.db.insert("invoices", {
      tenantId: tenant._id,
      invoiceNumber,
      customerId: args.customerId,
      customerName: args.customerName.trim(),
      gstin: args.gstin?.trim().toUpperCase() || undefined,
      lines: pricedLines,
      taxableValue: gst.taxableValue,
      cgst: gst.cgst,
      sgst: gst.sgst,
      igst: gst.igst,
      grandTotal: gst.total,
      splits: args.splits,
      paymentMode: args.splits.map((s) => s.mode).join(" + "),
      createdAt: Date.now(),
    });

    // Move the billed stock off the shelf.
    for (const line of args.lines) {
      if (!line.itemId) continue;
      const item = await ctx.db.get(line.itemId);
      if (item && item.tenantId === tenant._id) {
        await ctx.db.patch(line.itemId, { status: "SOLD" });
      }
    }

    if (args.customerId) {
      const customer = await ctx.db.get(args.customerId);
      if (customer && customer.tenantId === tenant._id) {
        await ctx.db.patch(args.customerId, {
          totalPurchased: customer.totalPurchased + gst.total,
        });
      }
    }

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "INVOICE_ISSUED",
      entity: "invoices",
      detail: `${invoiceNumber} — ₹${gst.total} to ${args.customerName.trim()} (${pricedLines.length} lines, GST ₹${Math.round(gst.cgst + gst.sgst + gst.igst)}).`,
    });

    return { invoiceId, invoiceNumber, ...gst, lineCount: pricedLines.length };
  },
});
