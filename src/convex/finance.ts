import { query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireTenant } from "./lib/rbac";
import { ROLES } from "./schema";
import { computeInterest } from "../lib/gehnacloud";

const round = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Owner and accountant financial statements.
 *
 * Everything is derived from the transaction ledgers rather than stored, so a
 * bill issued a second ago is already reflected. GST is never counted as
 * revenue — only the taxable value is.
 */
export const profitAndLoss = query({
  args: { months: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { tenant, role } = await requireTenant(ctx, "reports");
    if (role !== ROLES.STORE_OWNER && role !== ROLES.ACCOUNTANT) {
      throw new ConvexError("Financial statements are restricted to the Owner and Accountant.");
    }

    const [invoices, karigarJobs, purchases] = await Promise.all([
      ctx.db
        .query("invoices")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
      ctx.db
        .query("karigarJobs")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
      ctx.db
        .query("purchases")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
    ]);

    const revenue = round(invoices.reduce((a, i) => a + i.taxableValue, 0));
    const outputGst = round(invoices.reduce((a, i) => a + i.cgst + i.sgst + i.igst, 0));
    // Cost is stamped on each invoice line at the rate the stock was bought at.
    const cogs = round(invoices.reduce((a, i) => a + i.lines.reduce((s, l) => s + l.costValue, 0), 0));
    const grossProfit = round(revenue - cogs);

    // Labour billed to karigars on received job cards is a direct expense.
    const labour = round(
      karigarJobs
        .filter((j) => j.status === "RECEIVED")
        .reduce((a, j) => a + j.laborCharge, 0),
    );

    // Metal bought is capitalised into stock, not expensed — reported separately.
    const purchasesValue = round(purchases.reduce((a, p) => a + p.taxableValue, 0));
    const inputGst = round(purchases.reduce((a, p) => a + p.cgst + p.sgst + p.igst, 0));
    const itcClaimable = round(purchases.reduce((a, p) => a + p.itcClaimable, 0));

    const netProfit = round(grossProfit - labour);

    // ── monthly series ──
    const window = args.months ?? 6;
    const buckets: { key: string; revenue: number; cogs: number; profit: number }[] = [];
    const now = new Date();
    for (let i = window - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: monthKey(d.getTime()), revenue: 0, cogs: 0, profit: 0 });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const inv of invoices) {
      const b = byKey.get(monthKey(inv.createdAt));
      if (!b) continue;
      b.revenue = round(b.revenue + inv.taxableValue);
      b.cogs = round(b.cogs + inv.lines.reduce((s, l) => s + l.costValue, 0));
      b.profit = round(b.revenue - b.cogs);
    }

    return {
      headline: {
        revenue,
        cogs,
        grossProfit,
        grossMarginPct: revenue > 0 ? round((grossProfit / revenue) * 100) : 0,
        labour,
        netProfit,
        netMarginPct: revenue > 0 ? round((netProfit / revenue) * 100) : 0,
        invoiceCount: invoices.length,
      },
      workingCapital: {
        purchasesValue,
        inputGst,
        itcClaimable,
        outputGst,
        /** GST position: positive means you owe the department. */
        gstPayable: round(outputGst - itcClaimable),
      },
      monthly: buckets,
    };
  },
});

/**
 * Balance sheet.
 *
 * The owner's capital is not tracked as a separate ledger, so the sheet is
 * derived and the residual is shown explicitly as a balancing figure rather
 * than being silently buried inside profit.
 */
export const balanceSheet = query({
  args: {},
  handler: async (ctx) => {
    const { tenant, role } = await requireTenant(ctx, "reports");
    // The accountant legitimately sees the P&L but not the balance sheet.
    // Return null rather than throwing — a thrown ConvexError inside useQuery
    // tears down the whole Reports page for that role.
    if (role !== ROLES.STORE_OWNER) return null;

    const [items, loans, karigars, purchases, customers, invoices] = await Promise.all([
      ctx.db
        .query("inventoryItems")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
      ctx.db
        .query("girviLoans")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
      ctx.db
        .query("karigars")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
      ctx.db
        .query("purchases")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
      ctx.db
        .query("customers")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
      ctx.db
        .query("invoices")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
        .collect(),
      ctx.db.query("liveRates").collect(),
    ]);

    const gold22 =
      (await ctx.db.query("liveRates").collect()).find(
        (r) => r.metalType === "GOLD" && r.purityKarat === 22,
      )?.ratePerGram ?? 0;

    // ── assets ──
    const closingStock = round(
      items.filter((i) => i.status === "IN_STOCK").reduce((a, i) => a + i.netWeight * i.purchaseRate, 0),
    );
    const girviAdvanced = round(
      loans
        .filter((l) => l.status !== "CLOSED")
        .reduce((a, l) => a + (l.pledgedAmount - l.principalPaid), 0),
    );
    const inputCredit = round(purchases.reduce((a, p) => a + p.itcClaimable, 0));

    const assets = round(closingStock + girviAdvanced + inputCredit);

    // ── liabilities ──
    const now = Date.now();
    const girviDue = round(
      loans
        .filter((l) => l.status !== "CLOSED")
        .reduce(
          (a, l) =>
            a +
            computeInterest({
              pledgedAmount: l.pledgedAmount,
              annualInterestRate: l.annualInterestRate,
              interestType: l.interestType === "COMPOUND" ? "COMPOUND" : "SIMPLE",
              graceMonths: l.graceMonths,
              penaltyRate: l.penaltyRate,
              loanDate: l.loanDate,
              interestPaid: l.interestPaid,
              principalPaid: l.principalPaid,
            }, now).amountDue,
          0,
        ),
    );
    const gstPayable = round(
      invoices.reduce((a, i) => a + i.cgst + i.sgst + i.igst, 0) - inputCredit,
    );
    const karigarPayable = round(karigars.reduce((a, k) => a + k.cashBalance, 0));
    // Gold already collected under Kitty schemes but not yet redeemed is a
    // customer advance — we owe them stock, not cash.
    const kittyAdvances = round(
      customers.reduce((a, c) => {
        if (!c.kittyActive) return a;
        const accrued = c.kittyMonthlyGrams * c.kittyPaidMonths;
        const outstanding = Math.max(0, accrued - (c.kittyRedeemedGrams ?? 0));
        return a + outstanding * gold22;
      }, 0),
    );

    const liabilities = round(girviDue + gstPayable + karigarPayable + kittyAdvances);

    // ── equity: retained profit from the period ──
    const revenue = round(invoices.reduce((a, i) => a + i.taxableValue, 0));
    const cogs = round(
      invoices.reduce((a, i) => a + i.lines.reduce((s, l) => s + l.costValue, 0), 0),
    );
    const retained = round(revenue - cogs);

    const equity = round(assets - liabilities);
    const balancing = round(equity - retained);

    return {
      assets: [
        { label: "Closing stock (at cost)", value: closingStock },
        { label: "Girvi advanced to pledgers", value: girviAdvanced },
        { label: "Input tax credit receivable", value: inputCredit },
      ],
      liabilities: [
        { label: "Girvi amount due from pledgers", value: girviDue },
        { label: "GST payable to government", value: gstPayable },
        { label: "Karigar labour payable", value: karigarPayable },
        { label: "Kitty advances from customers", value: kittyAdvances },
      ],
      totals: {
        assets,
        liabilities,
        retained,
        balancing,
        /** Owner capital implied by the books. */
        capital: round(retained + balancing),
      },
      asOf: Date.now(),
      stockUnits: items.filter((i) => i.status === "IN_STOCK").length,
      lastBillDays: invoices.length
        ? Math.floor((now - Math.max(...invoices.map((i) => i.createdAt))) / DAY)
        : 0,
    };
  },
});
