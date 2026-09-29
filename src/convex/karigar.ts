import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { actorLabel, audit, requireTenant } from "./lib/rbac";
import { purityValidator } from "./schema";
import { computeWastage } from "../lib/gehnacloud";

/**
 * Module 4 — Karigar & Job Work Management.
 *
 * A Karigar holds two kinds of balance: pure metal in his custody (the *ghat*
 * ledger, in grams) and cash owed as labour. Both are reconciled here from the
 * job cards rather than maintained by hand.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { tenant } = await requireTenant(ctx, "karigar");

    const [karigars, jobs] = await Promise.all([
      ctx.db
        .query("karigars")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
      ctx.db
        .query("karigarJobs")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
    ]);

    const karigarById = new Map(karigars.map((k) => [k._id, k]));

    const enrichedJobs = jobs
      .map((job) => {
        const wastage =
          job.status === "RECEIVED" && job.receivedWeight != null && job.receivedPurity != null
            ? computeWastage({
                issuedWeight: job.issuedWeight,
                issuedPurity: job.issuedPurity as number,
                receivedWeight: job.receivedWeight,
                receivedPurity: job.receivedPurity as number,
                allowedWastagePct: job.allowedWastagePct,
              })
            : null;
        return { ...job, karigar: karigarById.get(job.karigarId) ?? null, wastage };
      })
      .sort((a, b) => b.issuedAt - a.issuedAt);

    return {
      karigars: karigars
        .map((k) => ({
          ...k,
          openJobs: jobs.filter((j) => j.karigarId === k._id && j.status === "ISSUED").length,
        }))
        .sort((a, b) => b.metalInHand - a.metalInHand),
      jobs: enrichedJobs,
      summary: {
        karigarCount: karigars.length,
        /** Metal out with goldsmiths and not yet returned. */
        openJobs: jobs.filter((j) => j.status === "ISSUED").length,
        metalOut: Math.round(
          jobs
            .filter((j) => j.status === "ISSUED")
            .reduce((acc, j) => acc + j.issuedWeight, 0) * 1000,
        ) / 1000,
        metalInHand: Math.round(karigars.reduce((acc, k) => acc + k.metalInHand, 0) * 1000) / 1000,
        labourPayable: karigars.reduce((acc, k) => acc + k.cashBalance, 0),
        /** Returned jobs that blew past the allowed wastage. */
        excessWastageJobs: enrichedJobs.filter((j) => j.wastage && !j.wastage.withinAllowance)
          .length,
      },
    };
  },
});

/** Issue fine metal against a new job card. */
export const issueJob = mutation({
  args: {
    karigarId: v.id("karigars"),
    description: v.string(),
    issuedWeight: v.number(),
    issuedPurity: purityValidator,
    allowedWastagePct: v.number(),
    laborCharge: v.number(),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "karigar");
    if (args.issuedWeight <= 0) throw new ConvexError("Issued weight must be positive.");

    const karigar = await ctx.db.get(args.karigarId);
    if (!karigar || karigar.tenantId !== tenant._id) throw new ConvexError("Karigar not found.");

    const jobId = await ctx.db.insert("karigarJobs", {
      tenantId: tenant._id,
      karigarId: args.karigarId,
      description: args.description,
      issuedWeight: args.issuedWeight,
      issuedPurity: args.issuedPurity,
      allowedWastagePct: args.allowedWastagePct,
      laborCharge: args.laborCharge,
      status: "ISSUED",
      dueDate: args.dueDate,
      issuedAt: Date.now(),
    });

    // Metal leaves the store and enters the karigar's ghat.
    await ctx.db.patch(args.karigarId, {
      metalInHand: karigar.metalInHand + args.issuedWeight,
    });

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "KARIGAR_ISSUE",
      entity: "karigarJobs",
      detail: `${args.issuedWeight}g @ ${args.issuedPurity} to ${karigar.name} — ${args.description}.`,
    });

    return jobId;
  },
});

/**
 * Receive finished goods. Reconciles fine metal against what was issued and
 * settles the labour charge, so both the ghat and the cash book stay true.
 */
export const receiveJob = mutation({
  args: {
    jobId: v.id("karigarJobs"),
    receivedWeight: v.number(),
    receivedPurity: purityValidator,
    laborCharge: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "karigar");
    const job = await ctx.db.get(args.jobId);
    if (!job || job.tenantId !== tenant._id) throw new ConvexError("Job card not found.");
    if (job.status === "RECEIVED") throw new ConvexError("This job is already received.");

    const wastage = computeWastage({
      issuedWeight: job.issuedWeight,
      issuedPurity: job.issuedPurity as number,
      receivedWeight: args.receivedWeight,
      receivedPurity: args.receivedPurity as number,
      allowedWastagePct: job.allowedWastagePct,
    });

    const karigar = await ctx.db.get(job.karigarId);
    if (!karigar) throw new ConvexError("Karigar not found.");

    const laborCharge = args.laborCharge ?? job.laborCharge;

    await ctx.db.patch(args.jobId, {
      receivedWeight: args.receivedWeight,
      receivedPurity: args.receivedPurity,
      laborCharge,
      status: "RECEIVED",
      receivedAt: Date.now(),
    });

    // Ghat: return of *fine* metal, not gross weight.
    await ctx.db.patch(job.karigarId, {
      metalInHand: Math.max(0, karigar.metalInHand - wastage.actualFineMetal),
      cashBalance: karigar.cashBalance + laborCharge,
    });

    await audit(ctx, {
      tenantId: tenant._id,
      action: "KARIGAR_RECEIVE",
      entity: "karigarJobs",
      actor: actorLabel(user),
      detail: `${job.description} — ${wastage.wastagePct}% wastage (${wastage.withinAllowance ? "within" : "OVER"} ${job.allowedWastagePct}% allowance), labour ₹${laborCharge}.`,
    });

    return { wastage };
  },
});

/** Settle a labour charge already billed against a karigar. */
export const settleLabour = mutation({
  args: { karigarId: v.id("karigars"), amount: v.number() },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "karigar");
    const karigar = await ctx.db.get(args.karigarId);
    if (!karigar || karigar.tenantId !== tenant._id) throw new ConvexError("Karigar not found.");
    if (args.amount <= 0 || args.amount > karigar.cashBalance) {
      throw new ConvexError("Amount exceeds the labour balance owed.");
    }

    await ctx.db.patch(args.karigarId, {
      cashBalance: karigar.cashBalance - args.amount,
    });

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "KARIGAR_SETTLED",
      entity: "karigars",
      detail: `₹${args.amount} paid to ${karigar.name}.`,
    });
    return true;
  },
});
