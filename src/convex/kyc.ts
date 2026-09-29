import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { actorLabel, audit, requireTenant } from "./lib/rbac";
import type { Doc, Id } from "./_generated/dataModel";

const MAX_BYTES = 8 * 1024 * 1024;

const KINDS = [
  "AADHAAR_FRONT",
  "AADHAAR_BACK",
  "PAN",
  "PLEDGE_PHOTO",
  "SIGNATURE",
] as const;

const KIND_LABEL: Record<string, string> = {
  AADHAAR_FRONT: "Aadhaar (front)",
  AADHAAR_BACK: "Aadhaar (back)",
  PAN: "PAN card",
  PLEDGE_PHOTO: "Pledged item photo",
  SIGNATURE: "Signature",
};

/**
 * A pledge is not properly documented until the identity papers, the photos of
 * the metal and the borrower's signature are all on file. This scores that.
 */
export function completeness(docs: Doc<"kycDocuments">[]): {
  score: number;
  missing: string[];
  complete: boolean;
} {
  const present = new Set(docs.map((d) => d.kind));
  const missing = KINDS.filter((k) => !present.has(k));
  const score = Math.round(((KINDS.length - missing.length) / KINDS.length) * 100);
  return { score, missing: missing.map((m) => KIND_LABEL[m]), complete: missing.length === 0 };
}

/** Step 1 — mint a short-lived upload URL for a KYC document. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const { tenant } = await requireTenant(ctx, "girvi");
    const storageId = await ctx.storage.generateUploadUrl();
    void tenant;
    return { url: storageId, maxBytes: MAX_BYTES };
  },
});

export const saveDocument = mutation({
  args: {
    storageId: v.optional(v.string()),
    dataUrl: v.optional(v.string()),
    kind: v.union(
      v.literal("AADHAAR_FRONT"),
      v.literal("AADHAAR_BACK"),
      v.literal("PAN"),
      v.literal("PLEDGE_PHOTO"),
      v.literal("SIGNATURE"),
    ),
    customerId: v.optional(v.id("customers")),
    loanId: v.optional(v.id("girviLoans")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "girvi");

    if (!args.storageId && !args.dataUrl) {
      throw new ConvexError("Attach a file or a signature before saving.");
    }
    if (!args.customerId && !args.loanId) {
      throw new ConvexError("Attach the document to a customer or a loan.");
    }

    // Drawings are stored as data URLs — keep them small enough to query back.
    if (args.dataUrl && args.dataUrl.length > 400_000) {
      throw new ConvexError("Signature image is too large. Draw it more lightly.");
    }

    const id = await ctx.db.insert("kycDocuments", {
      tenantId: tenant._id,
      customerId: args.customerId,
      loanId: args.loanId,
      kind: args.kind,
      storageId: args.storageId,
      dataUrl: args.dataUrl,
      note: args.note,
      verified: false,
      uploadedAt: Date.now(),
    });

    // A captured signature also flips the loan's signature flag.
    if (args.kind === "SIGNATURE" && args.loanId) {
      const loan = await ctx.db.get(args.loanId);
      if (loan && loan.tenantId === tenant._id) {
        await ctx.db.patch(args.loanId, { signatureCaptured: true });
      }
    }

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "KYC_DOCUMENT_ADDED",
      entity: "kycDocuments",
      detail: `${KIND_LABEL[args.kind]} attached${args.loanId ? " to pledge" : " to customer"}.`,
    });

    return id;
  },
});

/** Signed URLs are minted per request — storage ids never leave the server raw. */
export const forLoan = query({
  args: { loanId: v.id("girviLoans") },
  handler: async (ctx, args) => {
    const { tenant } = await requireTenant(ctx, "girvi");
    const loan = await ctx.db.get(args.loanId);
    if (!loan || loan.tenantId !== tenant._id) throw new ConvexError("Loan not found.");

    const docs = await ctx.db
      .query("kycDocuments")
      .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
      .collect();

    const withUrls = await Promise.all(
      docs.map(async (d) => ({
        ...d,
        url: d.storageId ? await ctx.storage.getUrl(d.storageId) : undefined,
      })),
    );

    return {
      documents: withUrls,
      completeness: completeness(docs),
      labels: KIND_LABEL,
    };
  },
});

export const forCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const { tenant } = await requireTenant(ctx, "customers");
    const customer = await ctx.db.get(args.customerId);
    if (!customer || customer.tenantId !== tenant._id) {
      throw new ConvexError("Customer not found.");
    }

    const docs = await ctx.db
      .query("kycDocuments")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    return {
      documents: await Promise.all(
        docs.map(async (d) => ({
          ...d,
          url: d.storageId ? await ctx.storage.getUrl(d.storageId) : undefined,
        })),
      ),
      completeness: completeness(docs),
      labels: KIND_LABEL,
    };
  },
});

export const verify = mutation({
  args: { documentId: v.id("kycDocuments"), verified: v.boolean() },
  handler: async (ctx, args) => {
    const { tenant } = await requireTenant(ctx, "girvi");
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.tenantId !== tenant._id) {
      throw new ConvexError("Document not found.");
    }
    await ctx.db.patch(args.documentId, { verified: args.verified });
    return true;
  },
});

export { KINDS, KIND_LABEL };
export type KycKind = (typeof KINDS)[number];
export type KycLoanId = Id<"girviLoans">;
