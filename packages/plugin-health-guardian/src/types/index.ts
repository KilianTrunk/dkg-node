import { z } from "zod";

// Health claim and analysis types
export interface HealthClaim {
  id: string;
  claimId: string;
  claim: string;
  status: HealthClaimStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type HealthClaimStatus = "analyzing" | "published" | "verified" | "disputed";

export interface AnalysisResult {
  summary: string;
  confidence: number; // 0.0 to 1.0
  verdict: HealthVerdict;
  sources: string[];
}

export type HealthVerdict = "true" | "false" | "misleading" | "uncertain";

// Community note types
export interface CommunityNote {
  id: string;
  noteId: string;
  claimId: string;
  ual?: string; // DKG UAL
  summary: string;
  confidence: number; // 0.0 to 1.0
  verdict: HealthVerdict;
  sources: string; // JSON string array
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCommunityNoteRequest {
  claimId: string;
  summary: string;
  confidence: number;
  verdict: HealthVerdict;
  sources: string[];
}

// Staking types
export interface Stake {
  id: number;
  noteId: string;
  userId: string;
  amount: number; // TRAC token amount
  position: StakePosition;
  reasoning?: string;
  createdAt: Date;
}

export type StakePosition = "support" | "oppose";

export interface StakeRequest {
  noteId: string;
  amount: number;
  position: StakePosition;
  reasoning?: string;
}

export interface StakeResult {
  stakeId: string;
  communityConsensus: ConsensusData;
  transactionHash?: string;
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

export interface PremiumAccessRequest {
  noteId: string;
  paymentAmount: number;
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

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface HealthClaimsResponse extends PaginatedResponse<HealthClaim> {}

export interface CommunityNotesResponse extends PaginatedResponse<CommunityNote> {}

export interface StakesResponse {
  stakes: Stake[];
  consensus: ConsensusData;
}

export interface MetricsResponse {
  claims: {
    total: number;
    byStatus: Array<{ status: HealthClaimStatus; count: number }>;
    recent24h: number;
  };
  notes: {
    total: number;
    published: number;
    unpublished: number;
    confidenceStats: {
      avgConfidence: number;
      minConfidence: number;
      maxConfidence: number;
    };
  };
  staking: {
    totalStakes: number;
    totalAmount: number;
    byPosition: Array<{
      position: StakePosition;
      count: number;
      totalAmount: number;
    }>;
  };
  premium: {
    totalAccesses: number;
    activeAccesses: number;
    totalRevenue: number;
  };
}

export interface SystemHealthResponse {
  healthScore: number; // 0-100
  timestamp: string;
  status: "healthy" | "degraded" | "unhealthy";
  metrics: MetricsResponse;
}

// Service interfaces for better type safety
export interface IAIAnalysisService {
  initializeAIClient(): Promise<void>;
  analyzeHealthClaim(claim: string, context?: string): Promise<AnalysisResult>;
}

export interface IDkgService {
  initialize(ctx?: any): Promise<void>;
  publishKnowledgeAsset(content: any, privacy?: "private" | "public"): Promise<DkgPublishResult>;
  getKnowledgeAsset(ual: string): Promise<DkgAsset | null>;
  queryHealthAssets(sparqlQuery: string): Promise<any>;
  executeSparqlQuery(query: string): Promise<any>;
}

export interface ITokenomicsService {
  initialize(): Promise<void>;
  stakeTokens(request: StakeRequest): Promise<StakeResult>;
  getStakeConsensus(noteId: string): Promise<ConsensusData>;
}

export interface IPaymentService {
  initialize(): Promise<void>;
  requestPremiumAccess(userId: string, noteId: string, amount: number): Promise<{ paymentUrl: string; paymentId: string; paymentHeaders: Record<string, string> }>;
  processPremiumAccess(request: PremiumAccessRequest): Promise<PremiumAccess>;
}

export interface IMetricsService {
  getClaimsMetrics(): Promise<MetricsResponse["claims"]>;
  getNotesMetrics(): Promise<MetricsResponse["notes"]>;
  getStakingMetrics(): Promise<MetricsResponse["staking"]>;
  getPremiumMetrics(): Promise<MetricsResponse["premium"]>;
  getSystemHealth(): Promise<SystemHealthResponse>;
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
