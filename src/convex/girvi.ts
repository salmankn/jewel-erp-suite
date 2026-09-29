import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { actorLabel, audit, requireTenant } from "./lib/rbac";
import { metalValidator, purityValidator } from "./schema";
import { computeInterest, computeLtv } from "../lib/gehnacloud";
import type { Doc } from "./_generated/dataModel";

const DAY = 86_400_000;

/** Live collateral value of a loan at today's rate for the pledged metal. */
function ltvFor(loan: Doc<"girviLoans">, ratePerGram: number) {
  return computeLtv(
    Math.max(0, loan.pledgedAmount - loan.principalPaid),
    loan.netWeight,
    ratePerGram,
  );
}

function interestFor(loan: Doc<"girviLoans">, now: number) {
  return computeInterest(
    {
      pledgedAmount: loan.pledgedAmount,
      annualInterestRate: loan.annualInterestRate,
      interestType: loan.interestType === "COMPOUND" ? "COMPOUND" : "SIMPLE",
      graceMonths: loan.graceMonths,
      penaltyRate: loan.penaltyRate,
      loanDate: loan.loanDate,
      interestPaid: loan.interestPaid,
      principalPaid: loan.principalPaid,
    },
    now,
  );
}

/**
 * Module 1 — GehnaGirvi.
 *
 * Interest and LTV are derived inside the query rather than stored, so they
 * always reflect the current rate board and today's date. A rate drop raises
 * LTV on every open pledge immediately, with no background job involved.
 */
export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { tenant } = await requireTenant(ctx, "girvi");

    const [loans, rates, customers] = await Promise.all([
      ctx.db
        .query("girviLoans")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
      ctx.db.query("liveRates").collect(),
      ctx.db
        .query("customers")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
    ]);

    const customerById = new Map(customers.map((c) => [c._id, c]));
    const rateByKey = new Map(
      rates.map((r) => [`${r.metalType}:${r.purityKarat}`, r.ratePerGram]),
    );
    const now = Date.now();

    const enriched = loans
      .filter((l) => !args.status || args.status === "ALL" || l.status === args.status)
      .map((loan) => {
        const ratePerGram = rateByKey.get(`${loan.metalType}:${loan.purityKarat}`) ?? 0;
        const interest = interestFor(loan, now);
        return {
          ...loan,
          customer: customerById.get(loan.customerId) ?? null,
          ratePerGram,
          interest,
          ltv: ltvFor(loan, ratePerGram),
          ageDays: Math.max(0, Math.floor((now - loan.loanDate) / DAY)),
        };
      })
      .sort((a, b) => b.interest.amountDue - a.interest.amountDue);

    const open = enriched.filter(
      (l) => l.status === "ACTIVE" || l.status === "OVERDUE",
    );

    return {
      loans: enriched,
      summary: {
        activeCount: open.length,
        /** Capital still out on the street. */
        disbursed: open.reduce((acc, l) => acc + l.pledgedAmount - l.principalPaid, 0),
        /** What every open pledge owes today, interest included. */
        outstanding: open.reduce((acc, l) => acc + l.interest.amountDue, 0),
        interestDueThisMonth: open.reduce(
          (acc, l) => acc + l.interest.outstandingInterest,
          0,
        ),
        collateralWeight:
          Math.round(open.reduce((acc, l) => acc + l.netWeight, 0) * 1000) / 1000,
        /** Loans breaching the 75% LTV threshold on today's rates. */
        atRisk: open.filter((l) => l.ltv.breached).length,
        critical: open.filter((l) => l.ltv.severity === "CRITICAL").length,
        overdue: open.filter((l) => l.status === "OVERDUE").length,
        closed: enriched.filter((l) => l.status === "CLOSED").length,
      },
    };
  },
});

export const detail = query({
  args: { loanId: v.id("girviLoans") },
  handler: async (ctx, args) => {
    const { tenant } = await requireTenant(ctx, "girvi");
    const loan = await ctx.db.get(args.loanId);
    if (!loan || loan.tenantId !== tenant._id) throw new ConvexError("Loan not found.");

    const [customer, payments, rates] = await Promise.all([
      ctx.db.get(loan.customerId),
      ctx.db
        .query("girviPayments")
        .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
        .collect(),
      ctx.db.query("liveRates").collect(),
    ]);

    const ratePerGram =
      rates.find(
        (r) => r.metalType === loan.metalType && r.purityKarat === loan.purityKarat,
      )?.ratePerGram ?? 0;

    return {
      loan,
      customer,
      payments: payments.sort((a, b) => b.at - a.at),
      ratePerGram,
      interest: interestFor(loan, Date.now()),
      ltv: ltvFor(loan, ratePerGram),
    };
  },
});

/** Jama — create a pledge against metal. */
export const createLoan = mutation({
  args: {
    customerId: v.id("customers"),
    metalType: metalValidator,
    purityKarat: purityValidator,
    grossWeight: v.number(),
    netWeight: v.number(),
    pledgedAmount: v.number(),
    annualInterestRate: v.number(),
    interestType: v.union(v.literal("SIMPLE"), v.literal("COMPOUND")),
    graceMonths: v.optional(v.number()),
    penaltyRate: v.optional(v.number()),
    kycStatus: v.optional(v.string()),
    signatureCaptured: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "girvi");

    if (args.pledgedAmount <= 0) throw new ConvexError("Pledged amount must be positive.");
    if (args.netWeight <= 0) throw new ConvexError("Net weight must be positive.");
    if (args.grossWeight < args.netWeight) {
      throw new ConvexError("Gross weight cannot be lower than net weight.");
    }

    const customer = await ctx.db.get(args.customerId);
    if (!customer || customer.tenantId !== tenant._id) {
      throw new ConvexError("Customer not found in this workspace.");
    }

    // LTV guard — refuse to over-advance against the pledged metal.
    const rates = await ctx.db.query("liveRates").collect();
    const rate =
      rates.find(
        (r) => r.metalType === args.metalType && r.purityKarat === args.purityKarat,
      )?.ratePerGram ?? 0;
    if (rate > 0) {
      const ltv = computeLtv(args.pledgedAmount, args.netWeight, rate);
      if (ltv.ltvPct > 85) {
        throw new ConvexError(
          `LTV would be ${ltv.ltvPct}% of live collateral value. Girvi is capped at 85% — reduce the advance.`,
        );
      }
    }

    const count = await ctx.db
      .query("girviLoans")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
      .collect();

    const loanNumber = `GRV-${new Date().getFullYear()}-${String(count.length + 1).padStart(4, "0")}`;
    const now = Date.now();

    const loanId = await ctx.db.insert("girviLoans", {
      tenantId: tenant._id,
      loanNumber,
      customerId: args.customerId,
      metalType: args.metalType,
      purityKarat: args.purityKarat,
      grossWeight: args.grossWeight,
      netWeight: args.netWeight,
      pledgedAmount: args.pledgedAmount,
      annualInterestRate: args.annualInterestRate,
      interestType: args.interestType,
      graceMonths: args.graceMonths ?? 1,
      penaltyRate: args.penaltyRate ?? args.annualInterestRate + 0.75,
      interestPaid: 0,
      principalPaid: 0,
      loanDate: now,
      status: "ACTIVE",
      kycStatus: args.kycStatus ?? "PENDING",
      signatureCaptured: args.signatureCaptured ?? false,
      createdAt: now,
    });

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "GIRVI_JAMA",
      entity: "girviLoans",
      detail: `${loanNumber} — ${args.netWeight}g @ ${args.purityKarat}, ₹${args.pledgedAmount} to ${customer.name}.`,
    });

    return loanId;
  },
});

/**
 * Be-Cash (partial) and Chudai (final settlement).
 *
 * Interest is always applied before principal, so a part payment clears the
 * accruing cost first. A SETTLEMENT clears the exact outstanding amount and
 * issues the release NOC that frees the pledged goods.
 */
export const recordPayment = mutation({
  args: {
    loanId: v.id("girviLoans"),
    kind: v.union(v.literal("INTEREST"), v.literal("PRINCIPAL"), v.literal("SETTLEMENT")),
    amount: v.number(),
    mode: v.union(v.literal("CASH"), v.literal("UPI"), v.literal("CARD"), v.literal("BANK")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "girvi");
    const loan = await ctx.db.get(args.loanId);
    if (!loan || loan.tenantId !== tenant._id) throw new ConvexError("Loan not found.");
    if (loan.status === "CLOSED") throw new ConvexError("This loan is already settled.");
    if (args.amount <= 0) throw new ConvexError("Amount must be positive.");

    const due = interestFor(loan, Date.now());
    const now = Date.now();

    let interestPaid = loan.interestPaid;
    let principalPaid = loan.principalPaid;
    let status: string = loan.status;
    let nocNumber: string | undefined;

    if (args.kind === "INTEREST") {
      if (args.amount > due.outstandingInterest + 1) {
        throw new ConvexError(
          `Interest due is ₹${due.outstandingInterest}. Use a settlement to close the loan.`,
        );
      }
      interestPaid += args.amount;
    } else if (args.kind === "PRINCIPAL") {
      const interestPart = Math.min(args.amount, due.outstandingInterest);
      interestPaid += interestPart;
      principalPaid += Math.min(args.amount - interestPart, due.outstandingPrincipal);
    } else {
      if (args.amount < due.amountDue - 1) {
        throw new ConvexError(
          `Settlement is short by ₹${Math.round(due.amountDue - args.amount)}. Amount due is ₹${Math.round(due.amountDue)}.`,
        );
      }
      interestPaid = loan.interestPaid + due.outstandingInterest;
      principalPaid = loan.pledgedAmount;
      nocNumber = `NOC-${new Date().getFullYear()}-${String(now).slice(-6)}`;
      status = "CLOSED";
    }

    await ctx.db.insert("girviPayments", {
      tenantId: tenant._id,
      loanId: args.loanId,
      kind: args.kind,
      amount: args.amount,
      mode: args.mode,
      note: args.note,
      nocNumber,
      at: now,
    });

    await ctx.db.patch(args.loanId, { interestPaid, principalPaid, status });

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: status === "CLOSED" ? "GIRVI_CHUDAI" : "GIRVI_BE_CASH",
      entity: "girviLoans",
      detail: `${loan.loanNumber} — ₹${args.amount} via ${args.mode}${nocNumber ? ` · NOC ${nocNumber}` : ""}.`,
    });

    return { status, nocNumber, interestPaid, principalPaid };
  },
});

/** KYC completion: Aadhaar/PAN verified and the pledge agreement signed. */
export const captureKyc = mutation({
  args: {
    loanId: v.id("girviLoans"),
    kycStatus: v.union(v.literal("PENDING"), v.literal("VERIFIED")),
    signatureCaptured: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "girvi");
    const loan = await ctx.db.get(args.loanId);
    if (!loan || loan.tenantId !== tenant._id) throw new ConvexError("Loan not found.");

    await ctx.db.patch(args.loanId, {
      kycStatus: args.kycStatus,
      signatureCaptured: args.signatureCaptured,
    });

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "GIRVI_KYC",
      entity: "girviLoans",
      detail: `${loan.loanNumber} — KYC ${args.kycStatus}, signature ${args.signatureCaptured ? "captured" : "missing"}.`,
    });
    return true;
  },
});

/** Loan Transfer — move a pledge to another customer (gifting a pledged coin). */
export const transfer = mutation({
  args: {
    loanId: v.id("girviLoans"),
    toCustomerId: v.id("customers"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "girvi");
    const loan = await ctx.db.get(args.loanId);
    if (!loan || loan.tenantId !== tenant._id) throw new ConvexError("Loan not found.");

    const to = await ctx.db.get(args.toCustomerId);
    if (!to || to.tenantId !== tenant._id) throw new ConvexError("Target customer not found.");
    if (to._id === loan.customerId) throw new ConvexError("Already held by that customer.");

    const from = await ctx.db.get(loan.customerId);
    await ctx.db.patch(args.loanId, { customerId: args.toCustomerId });

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "GIRVI_TRANSFER",
      entity: "girviLoans",
      detail: `${loan.loanNumber} transferred from ${from?.name ?? "unknown"} to ${to.name}${args.reason ? ` — ${args.reason}` : ""}.`,
    });

    return true;
  },
});
