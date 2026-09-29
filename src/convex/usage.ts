import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { actorLabel, audit, requireAuth, requireTenant } from "./lib/rbac";
import { ROLES } from "./schema";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Subscription enforcement (PRD Portal 1 — SaaS Subscription & Billing).
 *
 * Limits are checked at the point of write, not just displayed on a dashboard,
 * so a shop on Retail Basic physically cannot outgrow its plan.
 */
export const usage = query({
  args: {},
  handler: async (ctx) => {
    const { tenant } = await requireTenant(ctx, "reports");

    const plans = await ctx.db.query("plans").collect();
    const plan = plans.find((p) => p.tier === tenant.planTier);

    const [items, members] = await Promise.all([
      ctx.db
        .query("inventoryItems")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
      ctx.db
        .query("memberships")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
    ]);

    const maxItems = plan?.maxItems ?? 250000;
    const maxStaff = plan?.maxStaff ?? 100;

    const trialLeftDays = tenant.trialEndsAt
      ? Math.ceil((tenant.trialEndsAt - Date.now()) / 86_400_000)
      : null;
    const renewsInDays = tenant.renewsAt
      ? Math.ceil((tenant.renewsAt - Date.now()) / 86_400_000)
      : null;

    return {
      plan,
      items: items.length,
      seats: members.length,
      limits: { maxItems, maxStaff },
      usagePct: {
        items: Math.min(100, Math.round((items.length / maxItems) * 100)),
        seats: Math.min(100, Math.round((members.length / maxStaff) * 100)),
      },
      itemsBlocked: items.length >= maxItems,
      seatsBlocked: members.length >= maxStaff,
      trialLeftDays,
      renewsInDays,
      expired:
        (trialLeftDays !== null && trialLeftDays < 0) ||
        (renewsInDays !== null && renewsInDays < 0),
      girviEnabled: plan?.girviEnabled ?? false,
    };
  },
});

/** Guard other mutations call before adding stock or seats. */
export async function assertRoom(
  ctx: Parameters<typeof requireTenant>[0],
  kind: "item" | "seat",
): Promise<void> {
  const { tenant } = await requireTenant(ctx, "reports");

  const plans = await ctx.db.query("plans").collect();
  const plan = plans.find((p) => p.tier === tenant.planTier);
  if (!plan) return;

  if (kind === "item") {
    const count = await ctx.db
      .query("inventoryItems")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
      .collect();
    if (count.length >= plan.maxItems) {
      throw new ConvexError(
        `Your ${plan.label} plan holds ${plan.maxItems.toLocaleString("en-IN")} items and the limit is reached. Upgrade to add more stock.`,
      );
    }
  } else {
    const count = await ctx.db
      .query("memberships")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
      .collect();
    if (count.length >= plan.maxStaff) {
      throw new ConvexError(
        `Your ${plan.label} plan includes ${plan.maxStaff} seats. Upgrade before inviting more staff.`,
      );
    }
  }
}

// ───────────────────────────── staff management ─────────────────────────────

export const members = query({
  args: {},
  handler: async (ctx) => {
    const { tenant } = await requireTenant(ctx, "reports");
    const rows = await ctx.db
      .query("memberships")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
      .collect();

    return Promise.all(
      rows.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return {
          id: m._id,
          role: m.role,
          joinedAt: m.createdAt,
          name: user?.name ?? user?.email ?? "Unknown",
          email: user?.email ?? "",
          lastKnownRole: user?.role ?? null,
        };
      }),
    );
  },
});

export const changeRole = mutation({
  args: {
    membershipId: v.id("memberships"),
    role: v.union(
      v.literal(ROLES.STORE_OWNER),
      v.literal(ROLES.SALES_STAFF),
      v.literal(ROLES.GIRVI_OPERATOR),
      v.literal(ROLES.ACCOUNTANT),
    ),
  },
  handler: async (ctx, args) => {
    const { tenant, user, role } = await requireTenant(ctx, "reports");
    if (role !== ROLES.STORE_OWNER) {
      throw new ConvexError("Only the Store Owner can change roles.");
    }

    const target = await ctx.db.get(args.membershipId);
    if (!target || target.tenantId !== tenant._id) {
      throw new ConvexError("That person is not on this workspace.");
    }
    if (target.userId === user._id) {
      throw new ConvexError("You cannot change your own role.");
    }

    await ctx.db.patch(args.membershipId, { role: args.role });
    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "ROLE_CHANGED",
      entity: "memberships",
      detail: `Membership ${String(args.membershipId)} → ${args.role}.`,
    });
    return true;
  },
});

export const removeMember = mutation({
  args: { membershipId: v.id("memberships") },
  handler: async (ctx, args) => {
    const { tenant, user, role } = await requireTenant(ctx, "reports");
    if (role !== ROLES.STORE_OWNER) {
      throw new ConvexError("Only the Store Owner can remove staff.");
    }

    const target = await ctx.db.get(args.membershipId);
    if (!target || target.tenantId !== tenant._id) {
      throw new ConvexError("That person is not on this workspace.");
    }
    if (target.userId === user._id) throw new ConvexError("You cannot remove yourself.");

    await ctx.db.delete(args.membershipId);
    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "MEMBER_REMOVED",
      entity: "memberships",
      detail: `Membership ${String(args.membershipId)} revoked.`,
    });
    return true;
  },
});

/** Renew or cancel a licence — owner self-serve, or the platform operator. */
export const renewLicence = mutation({
  args: { months: v.number(), renewAll: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    const targets: Doc<"tenants">[] = [];
    if (membership) {
      const t = await ctx.db.get(membership.tenantId);
      if (t) targets.push(t);
    } else if (user.role === ROLES.SUPER_ADMIN) {
      const all = await ctx.db.query("tenants").collect();
      targets.push(...(args.renewAll ? all : all.filter((t) => t.status !== "CHURNED")));
    }

    if (targets.length === 0) {
      throw new ConvexError("No workspace found to renew.");
    }
    if (args.months < 0 || args.months > 60) {
      throw new ConvexError("Choose a term between 0 and 60 months.");
    }

    const base = Date.now();
    for (const t of targets) {
      await ctx.db.patch(t._id, {
        renewsAt: base + args.months * 30 * 86_400_000,
        trialEndsAt: undefined,
        status: args.months > 0 ? "ACTIVE" : t.status,
      });
      await audit(ctx, {
        tenantId: t._id,
        actor: actorLabel(user),
        action: args.months > 0 ? "LICENCE_RENEWED" : "LICENCE_LAPSED",
        entity: "tenants",
        detail: `${t.businessName} — ${args.months} month term.`,
      });
    }
    return targets.length;
  },
});

export type MemberId = Id<"memberships">;
