import { getAuthUserId } from "@convex-dev/auth/server";
import { action, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireTenant } from "./lib/rbac";
import { computeInterest } from "../lib/gehnacloud";
import { recordDispatch, tenantForUser } from "./notify";
import type { FunctionReference } from "convex/server";

// Imported directly rather than through `api.*`: resolving the generated `api`
// object from inside a module it contains makes TypeScript's inference
// circular (the api type includes this very action). These casts keep
// inference from re-entering the api graph.
const tenantForUserRef =
  tenantForUser as unknown as FunctionReference<"query", "public">;
const recordDispatchRef =
  recordDispatch as unknown as FunctionReference<"mutation", "public">;
import type { Id } from "./_generated/dataModel";

/**
 * Module 5 — WhatsApp Business dispatch.
 *
 * The copy is composed in a query (`compose`) and delivered by an action
 * (`deliver`), because the Meta call needs `process.env` for credentials that
 * live in the project's Keys UI:
 *   WHATSAPP_TOKEN           — permanent access token from the Meta developer portal
 *   WHATSAPP_PHONE_NUMBER_ID — the sender number's WhatsApp Business Account id
 *   WHATSAPP_TEMPLATE_NAME   — approved template name (defaults to GIRVI_UPDATE)
 *
 * WhatsApp only permits free-form messages inside a 24-hour customer service
 * window; everything else must go out as a pre-approved template, so the copy is
 * sent as template body parameters.
 */

const money = (n: number) =>
  `INR ${Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const grams = (n: number) => `${n.toFixed(3)}g`;

export interface Composed {
  to: string;
  body: string;
  amountDue: number;
  kind: "INVOICE" | "INTEREST_DUE" | "AUCTION_NOTICE";
  customerId?: Id<"customers">;
  loanId?: Id<"girviLoans">;
  invoiceId?: Id<"invoices">;
}

/** Builds the message text from the ledger — no network, safe to preview. */
export const compose = query({
  args: {
    kind: v.union(v.literal("INVOICE"), v.literal("INTEREST_DUE"), v.literal("AUCTION_NOTICE")),
    invoiceId: v.optional(v.id("invoices")),
    loanId: v.optional(v.id("girviLoans")),
  },
  handler: async (ctx, args): Promise<Composed> => {
    // Scoped per message kind: an invoice reminder only needs counter access,
    // while an interest or auction notice is Girvi-only. Requiring "reports"
    // here would break the button for sales staff and Girvi operators alike.
    const { tenant } = await requireTenant(
      ctx,
      args.kind === "INVOICE" ? "pos" : "girvi",
    );

    if (args.kind === "INVOICE") {
      if (!args.invoiceId) throw new ConvexError("Pick an invoice to send.");
      const inv = await ctx.db.get(args.invoiceId);
      if (!inv || inv.tenantId !== tenant._id) throw new ConvexError("Invoice not found.");

      const customer = inv.customerId ? await ctx.db.get(inv.customerId) : null;
      if (!customer?.phone) throw new ConvexError("No phone number on this invoice.");

      return {
        to: customer.phone,
        invoiceId: inv._id,
        customerId: customer._id,
        amountDue: inv.grandTotal,
        kind: "INVOICE",
        body: [
          `Dear ${inv.customerName},`,
          `Invoice ${inv.invoiceNumber} for ${money(inv.grandTotal)} has been generated at ${tenant.businessName}.`,
          `Taxable value ${money(inv.taxableValue)}, GST ${money(inv.cgst + inv.sgst + inv.igst)}.`,
          `Settled by ${inv.paymentMode}.`,
          "Thank you for your purchase.",
        ].join(" "),
      };
    }

    if (!args.loanId) throw new ConvexError("Pick a pledge to send about.");
    const loan = await ctx.db.get(args.loanId);
    if (!loan || loan.tenantId !== tenant._id) throw new ConvexError("Loan not found.");

    const customer = await ctx.db.get(loan.customerId);
    if (!customer?.phone) throw new ConvexError("No phone number on this pledge.");

    const due = computeInterest({
      pledgedAmount: loan.pledgedAmount,
      annualInterestRate: loan.annualInterestRate,
      interestType: loan.interestType === "COMPOUND" ? "COMPOUND" : "SIMPLE",
      graceMonths: loan.graceMonths,
      penaltyRate: loan.penaltyRate,
      loanDate: loan.loanDate,
      interestPaid: loan.interestPaid,
      principalPaid: loan.principalPaid,
    });

    if (args.kind === "AUCTION_NOTICE") {
      if ((loan.escalationStage ?? 0) < 2) {
        throw new ConvexError(
          "Issue the formal notice in the Girvi ledger before sending an auction notice.",
        );
      }
      return {
        to: customer.phone,
        loanId: loan._id,
        customerId: customer._id,
        amountDue: due.amountDue,
        kind: "AUCTION_NOTICE",
        body: [
          `Dear ${customer.name},`,
          `Formal notice regarding pledge ${loan.loanNumber}.`,
          `Collateral held ${grams(loan.netWeight)}, amount due ${money(due.amountDue)}.`,
          `Notice number ${loan.auctionNoticeNumber ?? "pending"}.`,
          "Please clear the dues to avoid the pledged items being auctioned.",
        ].join(" "),
      };
    }

    return {
      to: customer.phone,
      loanId: loan._id,
      customerId: customer._id,
      amountDue: due.amountDue,
      kind: "INTEREST_DUE",
      body: [
        `Dear ${customer.name},`,
        `Interest due on pledge ${loan.loanNumber} is ${money(due.outstandingInterest)}.`,
        `Total payable to release the item is ${money(due.amountDue)}.`,
        "Settle at the counter or over UPI.",
      ].join(" "),
    };
  },
});

/** Delivers a composed message through the Meta Cloud API. */
export const deliver = action({
  args: {
    message: v.object({
      to: v.string(),
      body: v.string(),
      amountDue: v.number(),
      kind: v.union(
        v.literal("INVOICE"),
        v.literal("INTEREST_DUE"),
        v.literal("AUCTION_NOTICE"),
      ),
      customerId: v.optional(v.id("customers")),
      loanId: v.optional(v.id("girviLoans")),
      invoiceId: v.optional(v.id("invoices")),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("You must be signed in.");

    // Imported directly rather than through `api.*`: resolving the generated
    // `api` object from inside a module it contains makes TS inference
    // circular. The cast keeps inference from re-entering the api graph.
    const tenant = await ctx.runQuery(tenantForUserRef, { userId });
    const m = args.message;

    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME ?? "GIRVI_UPDATE";

    let status = "SENT";
    let error: string | undefined;

    if (!token || !phoneNumberId) {
      status = "SKIPPED";
      error =
        "WhatsApp is not configured. Add WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in the Keys tab.";
    } else {
      const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
      const payload = {
        messaging_product: "whatsapp",
        to: m.to.replace(/\D/g, ""),
        type: "template",
        template: {
          name: templateName,
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: tenant.businessName },
                { type: "text", text: m.body },
                { type: "text", text: money(m.amountDue) },
              ],
            },
          ],
        },
      };

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          status = "FAILED";
          error = `HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`;
        }
      } catch (e) {
        status = "FAILED";
        error = e instanceof Error ? e.message : "Network failure reaching Meta.";
      }
    }

    await ctx.runMutation(recordDispatchRef, {
      channel: "WHATSAPP",
      tenantId: tenant._id,
      customerId: m.customerId,
      loanId: m.loanId,
      invoiceId: m.invoiceId,
      to: m.to,
      kind: m.kind,
      body: m.body,
      status,
      error,
      sentAt: Date.now(),
    });

    return { status, error, to: m.to, body: m.body };
  },
});

/** Whether the keys needed to actually deliver are present. */
export const configured = query({
  args: {},
  handler: async (ctx) => {
    await requireTenant(ctx, "reports");
    return {
      ready: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
      template: process.env.WHATSAPP_TEMPLATE_NAME ?? "GIRVI_UPDATE",
    };
  },
});
