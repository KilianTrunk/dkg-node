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
  summary: z.string().describe("AI-generated summary of the analysis"),
  confidence: z.number().min(0).max(1).describe("Confidence score between 0.0 and 1.0 (e.g., 0.7 for 70% confidence, NOT 70)"),
  verdict: z.enum(["true", "false", "misleading", "uncertain"]).describe("Verification verdict - must be lowercase: 'true', 'false', 'misleading', or 'uncertain'"),
  sources: z.array(z.string()).describe("Array of source references used in analysis"),
  annotates: z.object({
    id: z.string().describe("The @id (URI) of the Guardian Social Graph post being fact-checked"),
    ual: z.string().optional().describe("The DKG UAL of the Knowledge Asset being annotated"),
    headline: z.string().optional().describe("The headline/title of the annotated content"),
    platform: z.string().optional().describe("The platform (e.g., 'news', 'tweet', 'reddit-post')")
  }).optional().describe("Reference to the Guardian Social Graph asset being fact-checked - include when analyzing content fetched from DKG")
});

export const GetNoteSchema = z.object({
  noteId: z.string().optional().describe("Note ID from our database"),
  ual: z.string().optional().describe("DKG UAL of the note"),
  claimId: z.string().optional().describe("Claim ID to find associated notes"),
  userId: z.string().optional().describe("User ID to check for premium access")
});

export const StakeSchema = z.object({
  noteId: z.string().describe("ID of the community note"),
  amount: z.number().min(1).describe("Amount of TRAC tokens to stake"),
  position: z.enum(["support", "oppose"]).describe("Support or oppose the note"),
  reasoning: z.string().optional().describe("Optional reasoning for your stake")
});

export const PremiumAccessSchema = z.object({
  noteId: z.string().optional().describe("ID of the community note (optional - will use most recent if not provided)"),
  paymentAmount: z.number().min(0.01).default(0.01).describe("Payment amount for premium access")
});

export const PremiumAnalysisSchema = z.object({
  noteId: z.string().describe("ID of the community note to get premium analysis for")
});

export const CompletePaymentSchema = z.object({
  paymentId: z.string().describe("Payment ID to complete"),
  transactionHash: z.string().optional().describe("Blockchain transaction hash (optional for testing)")
});

export const AutonomousAnalysisSchema = z.object({
  claim: z.string().min(10).max(1000).describe("Health claim to analyze autonomously"),
  context: z.string().optional().describe("Additional context for the health claim analysis")
});

// API response types
export interface ConsensusData {
  support: number;
  oppose: number;
}

// Workflow types
export interface WorkflowProgress {
  currentStep: string;
  stepNumber: number;
  totalSteps: number;
  percentage: number;
  message: string;
  startTime: number;
  elapsedTime: number;
  estimatedTimeRemaining?: number;
}

export type ProgressCallback = (progress: WorkflowProgress) => void;

export interface WorkflowResult {
  success: boolean;
  claimId: string;
  noteId?: string;
  ual?: string;
  stakeId?: string;
  rewardId?: string;
  analysis?: AnalysisResult;
  errors: string[];
  executionTime: number;
  progress?: WorkflowProgress;
}

// Agent types


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
  publishKnowledgeAsset(content: any, privacy?: "private" | "public", relatedUals?: string[]): Promise<DkgPublishResult>;
  getKnowledgeAsset(ual: string): Promise<DkgAsset | null>;
  queryHealthAssets(sparqlQuery: string): Promise<any>;
  executeSparqlQuery(query: string): Promise<any>;
  findRelatedUals(claim: string, limit?: number): Promise<string[]>;
  findHealthClaimsToFactCheck(topics?: string[]): Promise<{
    success: boolean;
    posts: Array<{
      headline?: string;
      description?: string;
      url?: string;
      post?: string;
      ual?: string;
    }>;
    error?: string;
  }>;
}

import { AgentIdentity } from "../services/agentAuthService";

export interface ITokenomicsService {
  initialize(): Promise<void>;
  stakeTokens(request: StakeRequest, agent: AgentIdentity): Promise<StakeResult>;
  processPremiumPayment(noteId: string, amount: number): Promise<{
    transactionHash: string;
    blockNumber?: number;
    premiumPoolAddress: string;
  }>;
  getCommunityConsensus(noteId: string): Promise<{ support: number; oppose: number }>;
  checkTokenBalance(userId: string, token: "TRAC" | "NEURO", amount: number): Promise<boolean>;
  calculateRewards(noteId: string, finalVerdict: string): Promise<any>;
}

export interface IPaymentService {
  initialize(): Promise<void>;
  processPremiumAccess(paymentId: string, payerAddress: string, transactionHash?: string): Promise<{ transactionHash: string; grantedAt: Date; expiresAt: Date }>;
  requestPremiumAccess(userId: string, noteId: string, amount: number): Promise<{ paymentUrl: string; paymentId: string; paymentHeaders: Record<string, string> }>; // Legacy compatibility
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
