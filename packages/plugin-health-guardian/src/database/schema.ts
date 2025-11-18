import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const healthClaims = sqliteTable("health_claims", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  claimId: text("claim_id").notNull().unique(),
  claim: text("claim").notNull(),
  status: text("status", { enum: ["analyzing", "published", "verified", "disputed"] }).default("analyzing"),
  // Agent analysis results
  agentId: text("agent_id"),
  verdict: text("verdict", { enum: ["true", "false", "misleading", "uncertain"] }),
  confidence: real("confidence"),
  analysis: text("analysis", { mode: "json" }), // Full analysis data as JSON
  analyzedAt: integer("analyzed_at", { mode: "timestamp" }),
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

// Agent rewards table - tracks TRAC token rewards distributed to accurate agents
export const agentRewards = sqliteTable("agent_rewards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: text("agent_id").notNull(), // ID of the rewarded agent
  noteId: text("note_id").notNull(), // Note that was accurately analyzed
  amount: real("amount").notNull(), // TRAC tokens rewarded
  accuracy: real("accuracy").notNull(), // Accuracy score (0.0-1.0)
  verdict: text("verdict").notNull(), // Agent's verdict that was accurate
  finalVerdict: text("final_verdict").notNull(), // Community consensus verdict
  transactionHash: text("transaction_hash"), // Blockchain transaction hash
  distributedAt: integer("distributed_at", { mode: "timestamp" }).notNull(),
  reason: text("reason"), // Description of why reward was given
});
