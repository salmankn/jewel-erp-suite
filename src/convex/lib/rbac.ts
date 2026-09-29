import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { ROLES } from "../schema";
import { ROLE_PERMISSIONS } from "../../lib/gehnacloud";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Every tenant-scoped read/write runs through these two helpers. */
export type Ctx = QueryCtx | MutationCtx;

export async function requireAuth(ctx: Ctx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("You must be signed in.");
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("User record not found.");
  return user;
}

export function isSuperAdmin(user: Doc<"users">): boolean {
  return user.role === ROLES.SUPER_ADMIN;
}

export interface TenantContext {
  user: Doc<"users">;
  tenant: Doc<"tenants">;
  role: Doc<"memberships">["role"];
  membership: Doc<"memberships">;
}

/**
 * Resolves the caller's tenant by walking the JWT-equivalent (the Convex auth
 * session) down to a membership row — the analogue of the PRD's
 * `tenantRoutingMiddleware` reading `req.user.schema_name` off the decoded JWT.
 *
 * Every returned `tenant.schemaName` is the PostgreSQL schema this request is
 * pinned to; nothing outside it is queryable.
 */
export async function requireTenant(
  ctx: Ctx,
  module?: string | string[],
): Promise<TenantContext> {
  const user = await requireAuth(ctx);

  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();

  if (!membership) {
    throw new ConvexError(
      "No jeweller workspace is linked to this account yet. Run the workspace bootstrap.",
    );
  }

  const tenant = await ctx.db.get(membership.tenantId);
  if (!tenant) throw new ConvexError("Tenant schema not found.");

  if (module) {
    // A list means "any of these" — used where one capability is reachable from
    // more than one module, e.g. the WhatsApp outbox is owned by whoever can
    // send a message (Girvi operator or sales staff), not by "reports" alone.
    const allowed = Array.isArray(module) ? module : [module];
    const held = ROLE_PERMISSIONS[membership.role] ?? [];
    if (!allowed.some((m) => held.includes(m))) {
      throw new ConvexError(
        `Your role (${membership.role}) does not have access to this module.`,
      );
    }
  }

  if (tenant.status === "SUSPENDED") {
    throw new ConvexError("This workspace is suspended. Contact platform support.");
  }

  return { user, tenant, role: membership.role, membership };
}

/** Append-only audit trail — PRD NFR: immutability on financial records. */
export async function audit(
  ctx: MutationCtx,
  entry: {
    tenantId?: Id<"tenants">;
    actor: string;
    action: string;
    entity: string;
    detail?: string;
  },
): Promise<void> {
  await ctx.db.insert("auditLogs", { ...entry, at: Date.now() });
}

export function actorLabel(user: Doc<"users">): string {
  return user.name || user.email || user._id;
}

/** `MANG-0007` style per-tenant running serial. */
export async function nextSerial(
  ctx: MutationCtx,
  table: "invoices" | "girviLoans",
  tenantId: Id<"tenants">,
  prefix: string,
  pad = 4,
): Promise<string> {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
    .collect();
  return `${prefix}-${String(rows.length + 1).padStart(pad, "0")}`;
}
