import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const healthClaims = sqliteTable("health_claims", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  claimId: text("claim_id").notNull().unique(),
  claim: text("claim").notNull(),
  status: text("status", { enum: ["analyzing", "published", "verified", "disputed"] }).default("analyzing"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const communityNotes = sqliteTable("community_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  noteId: text("note_id").notNull().unique(),
  claimId: text("claim_id").notNull(),
  ual: text("ual"), // DKG UAL for the published note
  summary: text("summary").notNull(),
  confidence: real("confidence").notNull(), // 0.0 to 1.0
  verdict: text("verdict", { enum: ["true", "false", "misleading", "uncertain"] }).notNull(),
  sources: text("sources", { mode: "json" }), // JSON array of sources
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const stakes = sqliteTable("stakes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  noteId: text("note_id").notNull(),
  userId: text("user_id").notNull(), // From auth context
  amount: real("amount").notNull(), // TRAC token amount
  position: text("position", { enum: ["support", "oppose"] }).notNull(),
  reasoning: text("reasoning"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const premiumAccess = sqliteTable("premium_access", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  noteId: text("note_id").notNull(),
  paymentAmount: real("payment_amount").notNull(), // Mock payment amount
  grantedAt: integer("granted_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
});
