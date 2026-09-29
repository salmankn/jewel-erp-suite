import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { actorLabel, audit, requireAuth } from "./lib/rbac";
import { ROLES } from "./schema";
import { schemaNameFor, subdomainFor } from "../lib/gehnacloud";
import { ensurePlans, ensureRates } from "./seed";

/** Every function in this file is Portal 1 — Super Admin only. */
async function requireOperator(ctx: Parameters<typeof requireAuth>[0]) {
  const user = await requireAuth(ctx);
  if (user.role !== ROLES.SUPER_ADMIN) {
    throw new ConvexError("The Super Admin portal is restricted to platform operators.");
  }
  return user;
}

/** Platform-wide health, tenant registry, plans and the audit tail. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireOperator(ctx);

    const [tenants, plans, logs, rates] = await Promise.all([
      ctx.db.query("tenants").collect(),
      ctx.db.query("plans").collect(),
      ctx.db.query("auditLogs").order("desc").take(40),
      ctx.db.query("liveRates").collect(),
    ]);

    const ids = tenants.map((t) => t._id);

    const perTenant = await Promise.all(
      ids.map(async (id) => {
        const [items, loans, invoices, members] = await Promise.all([
          ctx.db
            .query("inventoryItems")
            .withIndex("by_tenant", (q) => q.eq("tenantId", id))
            .collect(),
          ctx.db
            .query("girviLoans")
            .withIndex("by_tenant", (q) => q.eq("tenantId", id))
            .collect(),
          ctx.db
            .query("invoices")
            .withIndex("by_tenant", (q) => q.eq("tenantId", id))
            .collect(),
          ctx.db
            .query("memberships")
            .withIndex("by_tenant", (q) => q.eq("tenantId", id))
            .collect(),
        ]);
        return {
          tenantId: id,
          items: items.length,
          openLoans: loans.filter((l) => l.status !== "CLOSED").length,
          revenue: invoices.reduce((a, i) => a + i.grandTotal, 0),
          seats: members.length,
        };
      }),
    );

    const usage = new Map(perTenant.map((u) => [u.tenantId as string, u]));

    return {
      tenants: tenants.map((t) => ({
        ...t,
        usage: usage.get(t._id as string) ?? {
          tenantId: t._id,
          items: 0,
          openLoans: 0,
          revenue: 0,
          seats: 0,
        },
      })),
      plans: plans.sort((a, b) => a.monthlyPrice - b.monthlyPrice),
      logs,
      rates: rates.sort((a, b) => a.metalType.localeCompare(b.metalType) || a.purityKarat - b.purityKarat),
      stats: {
        tenants: tenants.length,
        active: tenants.filter((t) => t.status === "ACTIVE").length,
        trials: tenants.filter((t) => t.status === "TRIAL").length,
        mrr: tenants
          .filter((t) => t.status === "ACTIVE")
          .reduce((a, t) => a + (plans.find((p) => p.tier === t.planTier)?.monthlyPrice ?? 0), 0),
        totalItems: perTenant.reduce((a, u) => a + u.items, 0),
        totalOpenLoans: perTenant.reduce((a, u) => a + u.openLoans, 0),
        platformRevenue: perTenant.reduce((a, u) => a + u.revenue, 0),
        seats: perTenant.reduce((a, u) => a + u.seats, 0),
      },
    };
  },
});

/**
 * Tenant Lifecycle Engine — onboard a jeweller: claim a subdomain, reserve an
 * isolated schema name, and register the tenant for schema provisioning.
 */
export const provisionTenant = mutation({
  args: {
    businessName: v.string(),
    ownerName: v.string(),
    ownerEmail: v.string(),
    planTier: v.string(),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    gstin: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireOperator(ctx);
    if (!args.businessName.trim()) throw new ConvexError("Business name is required.");
    if (!/^\S+@\S+\.\S+$/.test(args.ownerEmail)) throw new ConvexError("Enter a valid owner email.");

    const subdomain = subdomainFor(args.businessName);
    const schemaName = schemaNameFor(args.businessName);

    const clash = await ctx.db
      .query("tenants")
      .withIndex("subdomain", (q) => q.eq("subdomain", subdomain))
      .unique();
    if (clash) {
      throw new ConvexError(`Subdomain "${subdomain}" is already claimed by ${clash.businessName}.`);
    }

    await ensureRates(ctx);
    await ensurePlans(ctx);

    const plans = await ctx.db.query("plans").collect();
    const plan = plans.find((p) => p.tier === args.planTier);
    if (!plan) throw new ConvexError("Unknown plan tier.");

    const tenantId = await ctx.db.insert("tenants", {
      businessName: args.businessName.trim(),
      schemaName,
      subdomain,
      planTier: args.planTier,
      status: "TRIAL",
      ownerName: args.ownerName.trim(),
      ownerEmail: args.ownerEmail.trim().toLowerCase(),
      phone: args.phone,
      city: args.city,
      state: args.state,
      gstin: args.gstin?.toUpperCase(),
      trialEndsAt: Date.now() + 60 * 86_400_000,
      createdAt: Date.now(),
    });

    await audit(ctx, {
      tenantId,
      actor: actorLabel(user),
      action: "TENANT_PROVISIONED",
      entity: "tenants",
      detail: `${args.businessName} on ${args.planTier} — schema "${schemaName}", subdomain "${subdomain}".`,
    });

    return tenantId;
  },
});

export const setTenantStatus = mutation({
  args: {
    tenantId: v.id("tenants"),
    status: v.union(
      v.literal("ACTIVE"),
      v.literal("TRIAL"),
      v.literal("SUSPENDED"),
      v.literal("CHURNED"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireOperator(ctx);
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant) throw new ConvexError("Tenant not found.");

    await ctx.db.patch(args.tenantId, { status: args.status });
    await audit(ctx, {
      tenantId: args.tenantId,
      actor: actorLabel(user),
      action: "TENANT_STATUS_CHANGED",
      entity: "tenants",
      detail: `${tenant.businessName}: ${tenant.status} → ${args.status}.`,
    });
    return true;
  },
});

export const changePlan = mutation({
  args: { tenantId: v.id("tenants"), planTier: v.string() },
  handler: async (ctx, args) => {
    const user = await requireOperator(ctx);
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant) throw new ConvexError("Tenant not found.");

    const plans = await ctx.db.query("plans").collect();
    if (!plans.some((p) => p.tier === args.planTier)) throw new ConvexError("Unknown plan tier.");

    await ctx.db.patch(args.tenantId, { planTier: args.planTier });
    await audit(ctx, {
      tenantId: args.tenantId,
      actor: actorLabel(user),
      action: "PLAN_CHANGED",
      entity: "tenants",
      detail: `${tenant.businessName}: ${tenant.planTier} → ${args.planTier}.`,
    });
    return true;
  },
});

export const auditTrail = query({
  args: { tenantId: v.optional(v.id("tenants")) },
  handler: async (ctx, args) => {
    await requireOperator(ctx);
    const logs = args.tenantId
      ? await ctx.db
          .query("auditLogs")
          .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
          .collect()
      : await ctx.db.query("auditLogs").collect();
    return logs.sort((a, b) => b.at - a.at).slice(0, 120);
  },
});
