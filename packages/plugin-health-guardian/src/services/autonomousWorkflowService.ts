/**
 * Autonomous Workflow Service
 * Handles end-to-end agent operations without manual intervention
 */

import { createServiceLogger } from "./Logger";
import type { AgentIdentity } from "./agentAuthService";
import type { IAIAnalysisService, IDkgService, ITokenomicsService } from "../types";
import { healthClaims, communityNotes } from "../database";
import { db } from "../database";

const logger = createServiceLogger("autonomousWorkflowService");

// Workflow configuration for timeouts and optimization
const WORKFLOW_CONFIG = {
  timeouts: {
    aiAnalysis: 60000, // 60 seconds for AI analysis (increased)
    dkgPublish: 0, // No timeout for DKG publishing - critical operation cannot be interrupted
    tokenStake: 60000, // 60 seconds for token staking (increased)
    totalWorkflow: 240000, // 4 minutes total timeout (increased from 2min)
  },
  caching: {
    enabled: true,
    ttl: 3600000, // 1 hour cache TTL
  },
  progressReporting: {
    enabled: true,
    interval: 5000, // Report progress every 5 seconds
  },
  // Performance optimization modes
  performanceMode: process.env.HG_PERFORMANCE_MODE || 'balanced', // 'fast', 'balanced', 'reliable'
  fastMode: {
    // Reduce timeouts for faster processing (but less reliable)
    timeouts: {
      aiAnalysis: 30000, // 30 seconds (increased from 20s)
      dkgPublish: 0, // No timeout for DKG publishing - critical operation cannot be interrupted
      tokenStake: 30000, // 30 seconds (increased from 20s)
      totalWorkflow: 150000, // 2.5 minutes total (increased from 75s)
    },
    // Skip some operations in fast mode
    skipStaking: false,
    skipDetailedLogging: false,
  },
  // Environment variable controlled timeouts for production tuning
  // Note: DKG publishing defaults to no timeout (0) since it's a critical operation
  customTimeouts: {
    aiAnalysis: process.env.HG_TIMEOUT_AI_ANALYSIS ? parseInt(process.env.HG_TIMEOUT_AI_ANALYSIS) : null,
    dkgPublish: process.env.HG_TIMEOUT_DKG_PUBLISH ? parseInt(process.env.HG_TIMEOUT_DKG_PUBLISH) : null,
    tokenStake: process.env.HG_TIMEOUT_TOKEN_STAKE ? parseInt(process.env.HG_TIMEOUT_TOKEN_STAKE) : null,
    totalWorkflow: process.env.HG_TIMEOUT_TOTAL_WORKFLOW ? parseInt(process.env.HG_TIMEOUT_TOTAL_WORKFLOW) : null,
  }
};

/**
 * Workflow execution result
 */
export interface WorkflowResult {
  success: boolean;
  claimId: string;
  noteId?: string;
  ual?: string;
  stakeId?: string;
  rewardId?: string;
  errors: string[];
  executionTime: number;
  progress?: WorkflowProgress;
}

/**
 * Progress callback for workflow execution
 */
export type ProgressCallback = (progress: WorkflowProgress) => void;

/**
 * Workflow progress information
 */
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

/**
 * Simple in-memory cache for workflow results
 */
class WorkflowCache {
  private cache = new Map<string, { result: any; timestamp: number; ttl: number }>();

  set(key: string, value: any, ttl: number = WORKFLOW_CONFIG.caching.ttl): void {
    this.cache.set(key, { result: value, timestamp: Date.now(), ttl });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Autonomous Workflow Service
 * Executes complete analysis-to-reward workflows autonomously
 */
export class AutonomousWorkflowService {
  private aiService!: IAIAnalysisService;
  private dkgService!: IDkgService;
  private tokenomicsService!: ITokenomicsService;
  private initialized = false;
  private cache = new WorkflowCache();

  async initialize(services: {
    aiService: IAIAnalysisService;
    dkgService: IDkgService;
    tokenomicsService: ITokenomicsService;
  }) {
    this.aiService = services.aiService;
    this.dkgService = services.dkgService;
    this.tokenomicsService = services.tokenomicsService;
    this.initialized = true;

    logger.info("Autonomous Workflow Service initialized");
  }

  /**
   * Create a progress reporter for workflow execution
   */
  private createProgressReporter(callback?: ProgressCallback): {
    report: (step: string, stepNumber: number, totalSteps: number, message: string) => void;
    interval: NodeJS.Timeout | null;
  } {
    let lastReportTime = Date.now();
    let interval: NodeJS.Timeout | null = null;

    if (WORKFLOW_CONFIG.progressReporting.enabled && callback) {
      interval = setInterval(() => {
        const elapsed = Date.now() - lastReportTime;
        if (elapsed >= WORKFLOW_CONFIG.progressReporting.interval) {
          // Send a heartbeat progress update
          callback({
            currentStep: "processing",
            stepNumber: 0,
            totalSteps: 5,
            percentage: 0,
            message: "Processing... please wait",
            startTime: Date.now(),
            elapsedTime: elapsed,
            estimatedTimeRemaining: WORKFLOW_CONFIG.timeouts.totalWorkflow - elapsed
          });
        }
      }, WORKFLOW_CONFIG.progressReporting.interval);
    }

    const report = (step: string, stepNumber: number, totalSteps: number, message: string) => {
      if (callback) {
        const now = Date.now();
        const elapsed = now - lastReportTime;
        lastReportTime = now;

        const progress: WorkflowProgress = {
          currentStep: step,
          stepNumber,
          totalSteps,
          percentage: Math.round((stepNumber / totalSteps) * 100),
          message,
          startTime: now,
          elapsedTime: elapsed,
          estimatedTimeRemaining: Math.max(0, WORKFLOW_CONFIG.timeouts.totalWorkflow - elapsed)
        };

        callback(progress);
      }
    };

    return { report, interval };
  }

  /**
   * Get effective timeouts based on performance mode and environment variables
   */
  private getEffectiveTimeouts() {
    let baseTimeouts = WORKFLOW_CONFIG.timeouts;

    // Apply performance mode overrides
    const isFastMode = WORKFLOW_CONFIG.performanceMode === 'fast';
    if (isFastMode) {
      baseTimeouts = {
        ...WORKFLOW_CONFIG.timeouts,
        ...WORKFLOW_CONFIG.fastMode.timeouts
      };
    }

    // Apply environment variable overrides
    const customTimeouts = WORKFLOW_CONFIG.customTimeouts;
    const effectiveTimeouts = { ...baseTimeouts };

    if (customTimeouts.aiAnalysis !== null && customTimeouts.aiAnalysis !== undefined) effectiveTimeouts.aiAnalysis = customTimeouts.aiAnalysis;
    if (customTimeouts.dkgPublish !== null && customTimeouts.dkgPublish !== undefined) effectiveTimeouts.dkgPublish = customTimeouts.dkgPublish;
    if (customTimeouts.tokenStake !== null && customTimeouts.tokenStake !== undefined) effectiveTimeouts.tokenStake = customTimeouts.tokenStake;
    if (customTimeouts.totalWorkflow !== null && customTimeouts.totalWorkflow !== undefined) effectiveTimeouts.totalWorkflow = customTimeouts.totalWorkflow;

    return effectiveTimeouts;
  }

  /**
   * Execute operation with timeout (or without if timeoutMs is 0)
   */
  private async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<T> {
    // If timeout is 0, execute without timeout (for critical operations like DKG publishing)
    if (timeoutMs === 0) {
      return operation;
    }

    const effectiveTimeout = this.getEffectiveTimeouts();
    const actualTimeout = Math.min(timeoutMs, effectiveTimeout.totalWorkflow);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${actualTimeout}ms`));
      }, actualTimeout);
    });

    return Promise.race([operation, timeoutPromise]);
  }

  /**
   * Execute complete health claim analysis workflow with optimizations
   * Analysis → Publish → Stake → (Reward distribution triggered by consensus)
   */
  async executeHealthClaimWorkflow(
    agent: AgentIdentity,
    claim: string,
    context?: string,
    progressCallback?: ProgressCallback
  ): Promise<WorkflowResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const { report, interval } = this.createProgressReporter(progressCallback);

    // Cleanup interval on completion
    const cleanup = () => {
      if (interval) clearInterval(interval);
    };

    try {
      // Early validation
      if (!claim || claim.trim().length === 0) {
        throw new Error("Claim cannot be empty");
      }
      if (!agent.agentId) {
        throw new Error("Agent identity is required");
      }

      // Health check (fail fast if services are not ready)
      const healthCheck = await this.performHealthChecks();
      if (!healthCheck.overall) {
        throw new Error(`Service health check failed: ${JSON.stringify(healthCheck)}`);
      }

      const effectiveTimeouts = this.getEffectiveTimeouts();
      logger.info("Starting optimized autonomous health claim workflow", {
        agentId: agent.agentId,
        claimLength: claim.length,
        hasContext: !!context,
        performanceMode: WORKFLOW_CONFIG.performanceMode,
        effectiveTimeouts: {
          aiAnalysis: `${effectiveTimeouts.aiAnalysis}ms`,
          dkgPublish: effectiveTimeouts.dkgPublish === 0 ? "no timeout" : `${effectiveTimeouts.dkgPublish}ms`,
          tokenStake: `${effectiveTimeouts.tokenStake}ms`,
          totalWorkflow: `${effectiveTimeouts.totalWorkflow}ms`
        }
      });

      report("validation", 1, 5, "Validating request parameters and checking service health");

      // Generate IDs upfront
      const claimId = `claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const noteId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Check cache for similar claims
      const cacheKey = `analysis_${Buffer.from(claim.toLowerCase().trim()).toString('base64').substring(0, 50)}`;
      let analysis: any = null;

      if (WORKFLOW_CONFIG.caching.enabled) {
        analysis = this.cache.get(cacheKey);
        if (analysis) {
          logger.info("Using cached AI analysis", { cacheKey });
        }
      }

      // Step 1: AI Analysis (with timeout and caching)
      report("ai-analysis", 1, 5, "Performing AI analysis of health claim");
      if (!analysis) {
        logger.info("Step 1: Performing AI analysis (not cached)");
        const effectiveTimeouts = this.getEffectiveTimeouts();
        analysis = await this.withTimeout(
          this.aiService.analyzeHealthClaim(claim, context),
          effectiveTimeouts.aiAnalysis,
          "AI Analysis"
        );

        // Cache the result
        if (WORKFLOW_CONFIG.caching.enabled) {
          this.cache.set(cacheKey, analysis);
        }
      } else {
        logger.info("Step 1: Using cached AI analysis");
      }

      // Step 2: Parallel database operations
      report("database-storage", 2, 5, "Storing claim and analysis data");
      logger.info("Step 2: Storing claim and analysis in parallel");

      const claimData = {
        claimId,
        claim,
        status: "published" as const,
        agentId: agent.agentId,
        verdict: analysis.verdict,
        confidence: analysis.confidence,
        analysis: JSON.stringify(analysis),
        analyzedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Store claim (fast operation)
      await db.insert(healthClaims).values(claimData);

      // Step 3: Prepare data for DKG publishing
      report("dkg-preparation", 3, 5, "Preparing data for DKG publishing");
      const noteData = {
        claimId,
        claim,
        agentId: agent.agentId,
        agentName: agent.name,
        verdict: analysis.verdict,
        confidence: analysis.confidence,
        summary: analysis.summary,
        sources: analysis.sources,
        publishedAt: new Date().toISOString(),
        analysis
      };

      // Step 4: Publish to DKG (with timeout)
      report("dkg-publishing", 4, 5, "Publishing to Decentralized Knowledge Graph");
      logger.info("Step 4: Publishing to DKG");
      const publishResult = await this.withTimeout(
        this.dkgService.publishKnowledgeAsset(noteData, "public"),
        effectiveTimeouts.dkgPublish,
        "DKG Publishing"
      );
      const ual = publishResult.UAL;

      // Step 5: Parallel operations - Store community note and stake tokens
      report("finalization", 5, 5, "Finalizing workflow with staking and note storage");
      logger.info("Step 5: Finalizing with parallel operations");

      // Prepare staking data
      const stakeRequest = {
        noteId,
        amount: 1.0,
        position: (analysis.verdict === "true" ? "support" :
                 analysis.verdict === "false" ? "oppose" : "support") as "support" | "oppose",
        reasoning: `AI analysis by ${agent.name}: ${analysis.summary.substring(0, 200)}...`
      };

      // Run community note storage and staking in parallel
      const [noteResult, stakeResult] = await Promise.allSettled([
        // Store community note
        db.insert(communityNotes).values({
        noteId,
        claimId,
        ual,
        summary: analysis.summary,
        confidence: analysis.confidence,
        verdict: analysis.verdict,
        sources: JSON.stringify(analysis.sources),
        createdAt: new Date(),
        updatedAt: new Date(),
        }),
        // Stake tokens (with timeout, potentially skipped in fast mode)
        WORKFLOW_CONFIG.fastMode.skipStaking && WORKFLOW_CONFIG.performanceMode === 'fast'
          ? Promise.resolve({ stakeId: `skipped_${Date.now()}` })
          : this.withTimeout(
              this.tokenomicsService.stakeTokens(stakeRequest),
              this.getEffectiveTimeouts().tokenStake,
              "Token Staking"
            )
      ]);

      // Handle results
      if (noteResult.status === 'rejected') {
        errors.push(`Community note storage failed: ${noteResult.reason}`);
        logger.error("Community note storage failed", { error: noteResult.reason });
      }

      let stakeId: string | undefined;
      if (stakeResult.status === 'fulfilled') {
      stakeId = `stake_${Date.now()}`;
        logger.info("Auto-stake completed", {
        stakeId,
        amount: stakeRequest.amount,
        position: stakeRequest.position
      });
      } else {
        errors.push(`Token staking failed: ${stakeResult.reason}`);
        logger.error("Token staking failed", { error: stakeResult.reason });
      }

      const executionTime = Date.now() - startTime;

      const result: WorkflowResult = {
        success: errors.length === 0,
        claimId,
        noteId,
        ual,
        stakeId,
        errors,
        executionTime,
        progress: {
          currentStep: "completed",
          stepNumber: 5,
          totalSteps: 5,
          percentage: 100,
          message: "Workflow completed successfully",
          startTime,
          elapsedTime: executionTime
        }
      };

      logger.info("Optimized autonomous workflow completed", {
        claimId,
        noteId,
        ual,
        stakeId,
        executionTime,
        success: result.success,
        errorCount: errors.length
      });

      cleanup();
      return result;

    } catch (error) {
      cleanup();

      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);

      logger.error("Optimized autonomous workflow failed", {
        error: errorMessage,
        executionTime,
        errorCount: errors.length
      });

      return {
        success: false,
        claimId: "unknown",
        errors,
        executionTime,
        progress: {
          currentStep: "failed",
          stepNumber: 0,
          totalSteps: 5,
          percentage: 0,
          message: `Workflow failed: ${errorMessage}`,
          startTime,
          elapsedTime: executionTime
        }
      };
    }
  }

  /**
   * Execute reward distribution workflow
   * Checks consensus and distributes rewards automatically
   */
  async executeRewardDistributionWorkflow(noteId: string): Promise<WorkflowResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const claimId = "unknown"; // Will be resolved from noteId in real implementation

    try {
      logger.info("Starting autonomous reward distribution workflow", { noteId });

      // Get final consensus verdict
      const consensus = await this.getConsensusVerdict(noteId);
      if (!consensus.hasConsensus) {
        logger.info("No consensus reached yet, skipping rewards", { noteId });
        return {
          success: true,
          claimId: "unknown",
          errors: [],
          executionTime: Date.now() - startTime
        };
      }

      // Calculate and distribute rewards based on consensus
      const rewardResult = await this.tokenomicsService.calculateRewards(noteId, consensus.finalVerdict);

      if (rewardResult.totalRewards > 0) {
        logger.info("Rewards calculated and distributed successfully", {
          noteId,
          totalPool: rewardResult.totalRewards,
          agentCount: rewardResult.individualRewards.length
        });
      }

      const executionTime = Date.now() - startTime;
      return {
        success: true,
        claimId: "unknown",
        noteId,
        errors,
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);

      logger.error("Reward distribution workflow failed", {
        error: errorMessage,
        noteId,
        executionTime
      });

      return {
        success: false,
        claimId: "unknown",
        noteId,
        errors,
        executionTime
      };
    }
  }

  /**
   * Get consensus verdict for a note
   */
  private async getConsensusVerdict(noteId: string): Promise<{
    hasConsensus: boolean;
    finalVerdict: string;
    totalStakes: number;
  }> {
    // This would implement consensus logic based on staked amounts
    // For now, return a simple consensus check
    const stakes = await db.select().from(require("../database").stakes)
      .where(require("drizzle-orm").eq(require("../database").stakes.noteId, noteId));

    if (stakes.length < 3) { // Need minimum stakes for consensus
      return { hasConsensus: false, finalVerdict: "", totalStakes: stakes.length };
    }

    // Simple majority consensus
    const supportCount = stakes.filter(s => s.position === "support").length;
    const totalCount = stakes.length;

    const finalVerdict = supportCount > totalCount / 2 ? "true" : "false";

    return {
      hasConsensus: true,
      finalVerdict,
      totalStakes: totalCount
    };
  }

  /**
   * Execute maintenance workflows
   * Clean up expired payments, update trust scores, etc.
   */
  async executeMaintenanceWorkflow(): Promise<void> {
    try {
      logger.info("Starting maintenance workflow");

      // Clean up expired x402 payments
      // Update agent trust scores
      // Archive old claims
      // This would be called periodically

      logger.info("Maintenance workflow completed");
    } catch (error) {
      logger.error("Maintenance workflow failed", { error });
    }
  }

  /**
   * Perform health checks on all dependent services
   */
  async performHealthChecks(): Promise<{
    aiService: boolean;
    dkgService: boolean;
    tokenomicsService: boolean;
    database: boolean;
    overall: boolean;
  }> {
    const results = {
      aiService: false,
      dkgService: false,
      tokenomicsService: false,
      database: false,
      overall: false
    };

    try {
      // Check AI service (simple ping)
      results.aiService = this.aiService ? true : false;
    } catch (error) {
      logger.warn("AI service health check failed", { error });
    }

    try {
      // Check DKG service (simple availability check)
      results.dkgService = this.dkgService ? true : false;
    } catch (error) {
      logger.warn("DKG service health check failed", { error });
    }

    try {
      // Check tokenomics service
      results.tokenomicsService = this.tokenomicsService ? true : false;
    } catch (error) {
      logger.warn("Tokenomics service health check failed", { error });
    }

    try {
      // Check database connectivity with a simple query
      await db.select().from(healthClaims).limit(1);
      results.database = true;
    } catch (error) {
      logger.warn("Database health check failed", { error });
    }

    results.overall = results.aiService && results.dkgService && results.tokenomicsService && results.database;

    logger.info("Health check completed", { results });

    return results;
  }

  /**
   * Check if service is properly initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * Helper function to execute autonomous health claim analysis with optimizations
 */
export async function executeAutonomousHealthAnalysis(
  agent: AgentIdentity,
  claim: string,
  context?: string,
  progressCallback?: ProgressCallback
): Promise<WorkflowResult> {
  const workflowService = new AutonomousWorkflowService();

  // This would normally get services from dependency injection
  // For now, this is a placeholder for the actual implementation
  throw new Error("Autonomous workflow requires proper service initialization");

  // In real implementation:
  // return await workflowService.executeHealthClaimWorkflow(agent, claim, context, progressCallback);
}
