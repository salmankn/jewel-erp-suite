import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { actorLabel, audit, requireTenant } from "./lib/rbac";
import { metalValidator, purityValidator } from "./schema";
import { assertRoom } from "./usage";
import { computeNetWeight } from "../lib/gehnacloud";

const CATEGORIES = [
  "BANGLE",
  "NECKLACE",
  "RING",
  "PENDANT",
  "CHAIN",
  "BRACELET",
  "NOSEPIN",
  "COIN",
  "SET",
  "EARRING",
  "DIAMOND_STUD",
  "GEMSTONE_RING",
  "GEMSTONE_PENDANT",
];

/** Gemstones tracked as first-class stock alongside the metal. */
export const GEMSTONES = [
  "DIAMOND",
  "RUBY",
  "EMERALD",
  "SAPPHIRE",
  "PEARL",
  "AMETHYST",
  "TANZANITE",
] as const;

export const CLARITIES = ["IF", "VVS1", "VVS2", "VS", "SI1", "SI2", "I"] as const;

/** Module 2 — Smart Inventory. Staff may read stock; only owners add to it. */
export const list = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { tenant } = await requireTenant(ctx, "inventory");

    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
      .collect();

    const search = args.search?.trim().toLowerCase();
    const filtered = items.filter((it) => {
      if (args.status && args.status !== "ALL" && it.status !== args.status) return false;
      if (args.category && args.category !== "ALL" && it.category !== args.category)
        return false;
      if (!search) return true;
      return (
        it.itemName.toLowerCase().includes(search) ||
        it.barcode.toLowerCase().includes(search) ||
        it.huidNumber.includes(search) ||
        (it.rfidTag ?? "").toLowerCase().includes(search)
      );
    });

    const byStatus = items.reduce<Record<string, number>>((acc, it) => {
      acc[it.status] = (acc[it.status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      items: filtered.sort((a, b) => b.addedAt - a.addedAt),
      categories: CATEGORIES,
      gemstones: GEMSTONES,
      clarities: CLARITIES,
      summary: {
        total: items.length,
        inStock: byStatus.IN_STOCK ?? 0,
        sold: byStatus.SOLD ?? 0,
        pledged: byStatus.PLEDGED_GIRVI ?? 0,
        /** Total net gold weight sitting in the counter, in grams. */
        netWeight: Math.round(
          items
            .filter((i) => i.status !== "SOLD")
            .reduce((acc, i) => acc + i.netWeight, 0) * 1000,
        ) / 1000,
        stockValue: Math.round(
          items
            .filter((i) => i.status === "IN_STOCK")
            .reduce((acc, i) => acc + i.netWeight * i.purchaseRate, 0),
        ),
      },
    };
  },
});

/**
 * Add a piece to stock. Net weight is derived here — never trusted from the
 * client — and barcode / HUID / RFID identifiers are minted server-side.
 */
export const add = mutation({
  args: {
    itemName: v.string(),
    category: v.string(),
    metalType: metalValidator,
    purityKarat: purityValidator,
    grossWeight: v.number(),
    stoneWeight: v.optional(v.number()),
    enamelWeight: v.optional(v.number()),
    makingChargePerGram: v.optional(v.number()),
    gemstoneType: v.optional(v.string()),
    gemstoneCarat: v.optional(v.number()),
    gemstoneClarity: v.optional(v.string()),
    gemstoneRatePerCarat: v.optional(v.number()),
    gemstoneCount: v.optional(v.number()),
    purchaseRate: v.number(),
  },
  handler: async (ctx, args) => {
    const { tenant, user, role } = await requireTenant(ctx, "inventory");
    if (role !== "STORE_OWNER" && role !== "ACCOUNTANT") {
      throw new ConvexError("Only the Store Owner or Accountant can add stock.");
    }
    if (args.grossWeight <= 0) throw new ConvexError("Gross weight must be positive.");
    if (args.purchaseRate <= 0) throw new ConvexError("Purchase rate must be positive.");

    // Plan limit: a tenant on Retail Basic cannot outgrow its 5,000 items.
    await assertRoom(ctx, "item");

    const { netWeight } = computeNetWeight({
      grossWeight: args.grossWeight,
      stoneWeight: args.stoneWeight,
      enamelWeight: args.enamelWeight,
    });

    const existing = await ctx.db
      .query("inventoryItems")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
      .collect();

    const seq = existing.length + 1;
    const huidNumber = String(
      (600000 + seq * 137) % 1000000,
    ).padStart(6, "0");

    const id = await ctx.db.insert("inventoryItems", {
      tenantId: tenant._id,
      itemName: args.itemName,
      barcode: `BC-${Date.now().toString(36).toUpperCase()}`,
      rfidTag: `RFID-${String(70000 + seq * 3)}`,
      huidNumber,
      category: args.category,
      metalType: args.metalType,
      purityKarat: args.purityKarat,
      grossWeight: args.grossWeight,
      netWeight,
      stoneWeight: args.stoneWeight ?? 0,
      gemstoneType: args.gemstoneType,
      gemstoneCarat: args.gemstoneCarat,
      gemstoneClarity: args.gemstoneClarity,
      gemstoneRatePerCarat: args.gemstoneRatePerCarat,
      gemstoneCount: args.gemstoneCount,
      makingChargePerGram: args.makingChargePerGram ?? 0,
      status: "IN_STOCK",
      purchaseRate: args.purchaseRate,
      addedAt: Date.now(),
    });

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "STOCK_ADDED",
      entity: "inventoryItems",
      detail: `${args.itemName} — ${netWeight}g net @ ${args.purityKarat} (HUID ${huidNumber})`,
    });

    return id;
  },
});

export const setStatus = mutation({
  args: {
    itemId: v.id("inventoryItems"),
    status: v.union(
      v.literal("IN_STOCK"),
      v.literal("SOLD"),
      v.literal("PLEDGED_GIRVI"),
      v.literal("AUDITED"),
    ),
  },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "inventory");
    const item = await ctx.db.get(args.itemId);
    if (!item || item.tenantId !== tenant._id) throw new ConvexError("Item not found.");

    await ctx.db.patch(args.itemId, { status: args.status });
    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "STOCK_STATUS_CHANGED",
      entity: "inventoryItems",
      detail: `${item.itemName}: ${item.status} → ${args.status}`,
    });
    return true;
  },
});

/**
 * Module 2 — RFID Rapid Audit. A handheld scanner streams every tag it saw in
 * a sweep; we reconcile against the book and report what is missing or extra.
 */
export const rapidAudit = mutation({
  args: { scannedTags: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { tenant, user } = await requireTenant(ctx, "inventory");

    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
      .collect();

    const scanned = new Set(args.scannedTags.map((t) => t.trim().toUpperCase()));
    const matched: string[] = [];
    const missing: string[] = [];

    for (const it of items) {
      const tag = (it.rfidTag ?? "").toUpperCase();
      const isPresent = scanned.has(tag) || scanned.has(it.barcode.toUpperCase());
      if (isPresent) {
        matched.push(it.itemName);
        if (it.status !== "AUDITED") {
          await ctx.db.patch(it._id, { status: "AUDITED" });
        }
      } else {
        missing.push(it.itemName);
      }
    }

    const knownTags = new Set(
      items.map((i) => (i.rfidTag ?? "").toUpperCase()).filter(Boolean),
    );
    const unknownTags = [...scanned].filter((t) => !knownTags.has(t));

    await audit(ctx, {
      tenantId: tenant._id,
      actor: actorLabel(user),
      action: "RFID_AUDIT",
      entity: "inventoryItems",
      detail: `${matched.length} reconciled, ${missing.length} unaccounted.`,
    });

    return { matched, missing, unknownTags, sweptAt: Date.now() };
  },
});
