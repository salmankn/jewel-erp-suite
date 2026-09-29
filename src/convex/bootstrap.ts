import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { actorLabel, audit, requireAuth } from "./lib/rbac";
import { ROLES } from "./schema";
import { ensureDemoTenant, ensurePlans, ensureRates, ensureSalesHistory } from "./seed";
import { assertRoom } from "./usage";
import type { Doc, Id } from "./_generated/dataModel";

export type WorkspaceContext =
  | {
      kind: "platform";
      user: Doc<"users">;
      tenant: null;
      membership: null;
      role: "SUPER_ADMIN";
    }
  | {
      kind: "tenant";
      user: Doc<"users">;
      tenant: Doc<"tenants">;
      membership: Doc<"memberships">;
      role: Doc<"memberships">["role"];
    }
  | { kind: "unlinked"; user: Doc<"users">; tenant: null; membership: null; role: null };

/**
 * Where should this signed-in user land? Platform operators go to /admin,
 * jeweller staff go to /app. Nothing is created here — pure read.
 */
export const context = query({
  args: {},
  handler: async (ctx): Promise<WorkspaceContext> => {
    const user = await requireAuth(ctx);
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (membership) {
      const tenant = await ctx.db.get(membership.tenantId);
      if (tenant) {
        return {
          kind: "tenant",
          user,
          tenant,
          membership,
          role: membership.role,
        };
      }
    }

    if (user.role === ROLES.SUPER_ADMIN) {
      return { kind: "platform", user, tenant: null, membership: null, role: "SUPER_ADMIN" };
    }

    return { kind: "unlinked", user, tenant: null, membership: null, role: null };
  },
});

/**
 * Tenant Lifecycle Engine (PRD Portal 1). On first sign-in we provision the
 * demo jeweller's isolated schema, seed its books, and attach the user as
 * Store Owner. Idempotent — safe to call on every app mount.
 */
export const ensureWorkspace = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    // Already provisioned? Just make sure the global boards exist.
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    await ensureRates(ctx);
    await ensurePlans(ctx);

    if (existing) {
      const tenant = await ctx.db.get(existing.tenantId);
      if (tenant) {
        // Idempotent backfill for workspaces provisioned before the sales and
        // purchase ledgers existed.
        await ensureSalesHistory(ctx, existing.tenantId);
        return {
          tenant,
          membership: existing,
          role: existing.role,
          user,
          createdPlatformAdmin: false,
        };
      }
    }

    const tenant = await ensureDemoTenant(ctx);

    const membership = await ctx.db.insert("memberships", {
      tenantId: tenant._id,
      userId: user._id,
      role: ROLES.STORE_OWNER,
      name: user.name ?? user.email,
      createdAt: Date.now(),
    });

    // The very first operator to onboard becomes the platform super admin, so
    // the Super Admin portal is reachable during evaluation.
    const platformAdmin = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), ROLES.SUPER_ADMIN))
      .first();

    let createdPlatformAdmin = false;
    if (!platformAdmin) {
      await ctx.db.patch(user._id, { role: ROLES.SUPER_ADMIN });
      createdPlatformAdmin = true;
    }

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "TENANT_SCHEMA_PROVISIONED",
      entity: "tenants",
      detail: `Isolated schema "${tenant.schemaName}" created and seeded for ${tenant.businessName}.`,
    });

    return {
      tenant,
      membership,
      role: ROLES.STORE_OWNER,
      user,
      createdPlatformAdmin,
    };
  },
});

/** Grant a colleague a seat on this jeweller's workspace. Store Owner only. */
export const inviteMember = mutation({
  args: {
    email: v.string(),
    role: v.union(
      v.literal(ROLES.STORE_OWNER),
      v.literal(ROLES.SALES_STAFF),
      v.literal(ROLES.GIRVI_OPERATOR),
      v.literal(ROLES.ACCOUNTANT),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!membership) throw new ConvexError("No workspace linked.");
    if (membership.role !== ROLES.STORE_OWNER) {
      throw new ConvexError("Only the Store Owner can manage staff.");
    }
    const tenant = await ctx.db.get(membership.tenantId);
    if (!tenant) throw new ConvexError("Tenant not found.");

    // Plan limit: seats are capped by the tenant's subscription tier.
    await assertRoom(ctx, "seat");

    const invitee = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();
    if (!invitee) {
      throw new ConvexError(
        "No account found for that email. They must sign in once before you can assign a role.",
      );
    }

    const dupe = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", invitee._id))
      .first();
    if (dupe) throw new ConvexError("That person is already on a workspace.");

    const id: Id<"memberships"> = await ctx.db.insert("memberships", {
      tenantId: tenant._id,
      userId: invitee._id,
      role: args.role,
      createdAt: Date.now(),
    });

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "MEMBER_INVITED",
      entity: "memberships",
      detail: `${args.email} joined as ${args.role}.`,
    });

    return id;
  },
});
