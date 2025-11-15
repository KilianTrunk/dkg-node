import { z } from "zod";

// Health claim and analysis types
export interface HealthClaim {
  id: string;
  claim: string;
  status: "analyzing" | "published" | "verified" | "disputed";
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalysisResult {
  summary: string;
  confidence: number;
  verdict: "true" | "false" | "misleading" | "uncertain";
  sources: string[];
}

// Community note types
export interface CommunityNote {
  id: string;
  noteId: string;
  claimId: string;
  ual?: string;
  summary: string;
  confidence: number;
  verdict: "true" | "false" | "misleading" | "uncertain";
  sources: string;
  createdAt: Date;
  updatedAt: Date;
}

// Staking types
export interface Stake {
  id: number;
  noteId: string;
  userId: string;
  amount: number;
  position: "support" | "oppose";
  reasoning?: string;
  createdAt: Date;
}

export interface StakeResult {
  stakeId: string;
  communityConsensus: {
    support: number;
    oppose: number;
  };
}

// Premium access types
export interface PremiumAccess {
  id: number;
  userId: string;
  noteId: string;
  paymentAmount: number;
  grantedAt: Date;
  expiresAt?: Date;
}

// MCP Tool schemas
export const AnalyzeClaimSchema = z.object({
  claim: z.string().describe("The health claim to analyze"),
  context: z.string().optional().describe("Additional context about the claim")
});

export const PublishNoteSchema = z.object({
  claimId: z.string().describe("ID of the analyzed claim"),
  summary: z.string().describe("AI-generated summary"),
  confidence: z.number().min(0).max(1).describe("Confidence score 0-1"),
  verdict: z.enum(["true", "false", "misleading", "uncertain"]).describe("Verification verdict"),
  sources: z.array(z.string()).describe("Source references")
});

export const GetNoteSchema = z.object({
  noteId: z.string().optional().describe("Note ID from our database"),
  ual: z.string().optional().describe("DKG UAL of the note"),
  claimId: z.string().optional().describe("Claim ID to find associated notes")
});

export const StakeSchema = z.object({
  noteId: z.string().describe("ID of the community note"),
  amount: z.number().min(1).describe("Amount of TRAC tokens to stake"),
  position: z.enum(["support", "oppose"]).describe("Support or oppose the note"),
  reasoning: z.string().optional().describe("Optional reasoning for your stake")
});

export const PremiumAccessSchema = z.object({
  noteId: z.string().describe("ID of the community note"),
  paymentAmount: z.number().min(0.01).describe("Payment amount for premium access")
});

// API response types
export interface ConsensusData {
  support: number;
  oppose: number;
}

// DKG Edge Node types (placeholder for future implementation)
export interface DkgPublishResult {
  UAL: string;
  transactionHash?: string;
  blockNumber?: number;
}

export interface DkgAsset {
  UAL: string;
  content: any;
  metadata?: any;
  timestamp?: number;
}
