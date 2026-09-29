import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireTenant } from "./lib/rbac";

/**
 * Shared helpers for outbound notification channels (WhatsApp today, SMS later).
 *
 * These live in their own module rather than inside `whatsapp.ts` on purpose: a
 * Convex action that references `api.whatsapp.*` from its own handler makes
 * TypeScript's inference circular (the module's type includes the action that
 * is being inferred). Keeping the referenced functions in a sibling module
 * breaks that cycle.
 */

/**
 * Actions have no `ctx.db`, so a caller's tenant is resolved through this query.
 * The user id comes from the verified auth token, never from client input.
 */
export const tenantForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!membership) throw new ConvexError("No jeweller workspace is linked to this account.");

    const tenant = await ctx.db.get(membership.tenantId);
    if (!tenant) throw new ConvexError("Tenant schema not found.");

    return {
      tenantId: tenant._id,
      businessName: tenant.businessName,
      role: membership.role,
    };
  },
});

/** Appends a dispatch attempt to the tenant's outbox, sent or not. */
export const recordDispatch = mutation({
  args: {
    tenantId: v.id("tenants"),
    channel: v.string(),
    customerId: v.optional(v.id("customers")),
    loanId: v.optional(v.id("girviLoans")),
    invoiceId: v.optional(v.id("invoices")),
    to: v.string(),
    kind: v.string(),
    body: v.string(),
    status: v.string(),
    error: v.optional(v.string()),
    sentAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("whatsappMessages", args);
    return true;
  },
});

/** Recent dispatch history for the current tenant. */
export const outbox = query({
  args: {},
  handler: async (ctx) => {
    // Readable by anyone who can dispatch a message at all (Girvi notices or
    // counter invoices). Gating this on "reports" would throw for exactly the
    // operators whose sends it is meant to audit.
    const { tenant } = await requireTenant(ctx, ["girvi", "pos"]);
    const rows = await ctx.db
      .query("whatsappMessages")
      .withIndex("by_tenant_sent", (q) => q.eq("tenantId", tenant._id))
      .collect();
    return rows.sort((a, b) => b.sentAt - a.sentAt).slice(0, 50);
  },
});
