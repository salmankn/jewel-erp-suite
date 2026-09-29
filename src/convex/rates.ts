import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { actorLabel, audit, requireAuth } from "./lib/rbac";
import { ROLES } from "./schema";
import { ensureRates } from "./seed";
import type { Doc } from "./_generated/dataModel";

/**
 * Global Rate Engine (PRD Portal 1).
 *
 * `live_rates` lives in the *public master schema* — it is deliberately not
 * tenant-isolated, because a single IBJA feed drives pricing and LTV across
 * every jeweller on the platform. The read is public so the marketing site
 * can show the live board; writes are locked to the platform operator.
 */
export const board = query({
  args: {},
  handler: async (ctx): Promise<Doc<"liveRates">[]> => {
    return await ctx.db.query("liveRates").collect();
  },
});

/** Convenience lookup used by the billing and LTV engines. */
export function rateMap(
  rates: Doc<"liveRates">[],
): Map<string, number> {
  return new Map(rates.map((r) => [`${r.metalType}:${r.purityKarat}`, r.ratePerGram]));
}

export function rateFor(
  rates: Doc<"liveRates">[],
  metalType: string,
  purityKarat: number,
): number {
  return rates.find((r) => r.metalType === metalType && r.purityKarat === purityKarat)
    ?.ratePerGram ?? 0;
}

/** Broadcast a corrected/new rate to every tenant instance. */
export const updateRate = mutation({
  args: {
    id: v.id("liveRates"),
    ratePerGram: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== ROLES.SUPER_ADMIN) {
      throw new ConvexError("Only the platform operator can move the global rate board.");
    }
    if (args.ratePerGram <= 0) throw new ConvexError("Rate must be positive.");

    const existing = await ctx.db.get(args.id);
    if (!existing) throw new ConvexError("Rate row not found.");

    await ctx.db.patch(args.id, {
      ratePerGram: args.ratePerGram,
      updatedAt: Date.now(),
    });

    await audit(ctx, {
      actor: actorLabel(user),
      action: "RATE_BROADCAST",
      entity: "liveRates",
      detail: `${existing.metalType} ${existing.purityKarat}: ₹${existing.ratePerGram} → ₹${args.ratePerGram}`,
    });

    return args.id;
  },
});

/** Idempotently publish the seed board (public master data). */
export const publishSeedRates = mutation({
  args: {},
  handler: async (ctx) => {
    await ensureRates(ctx);
    return true;
  },
});
