import { createServiceLogger } from "./Logger";
import type { AgentIdentity } from "./agentAuthService";
import type { IAIAnalysisService, IDkgService, ITokenomicsService } from "../types";
import type { WorkflowResult, ProgressCallback } from "../types";
import { healthClaims, communityNotes } from "../database";
import { db } from "../database";
import { WorkflowConfig } from "./WorkflowConfig";
import { WorkflowCache } from "./WorkflowCache";
import { ProgressReporter } from "./ProgressReporter";

const logger = createServiceLogger("HealthClaimWorkflowService");

/**
 * Service for executing health claim analysis workflows
 */
export class HealthClaimWorkflowService {
  private aiService!: IAIAnalysisService;
  private dkgService!: IDkgService;
  private tokenomicsService!: ITokenomicsService;
  private cache = new WorkflowCache();

  async initialize(services: {
    aiService: IAIAnalysisService;
    dkgService: IDkgService;
    tokenomicsService: ITokenomicsService;
  }) {
    this.aiService = services.aiService;
    this.dkgService = services.dkgService;
    this.tokenomicsService = services.tokenomicsService;
    logger.info("HealthClaimWorkflowService initialized");
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
    const progressReporter = new ProgressReporter(progressCallback);

    // Cleanup on completion
    const cleanup = () => progressReporter.stop();

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

      const effectiveTimeouts = WorkflowConfig.getEffectiveTimeouts();
      logger.info("Starting optimized autonomous health claim workflow", {
        agentId: agent.agentId,
        claimLength: claim.length,
        hasContext: !!context,
        performanceMode: WorkflowConfig.performanceMode,
        effectiveTimeouts: {
          aiAnalysis: `${effectiveTimeouts.aiAnalysis}ms`,
          dkgPublish: effectiveTimeouts.dkgPublish === 0 ? "no timeout" : `${effectiveTimeouts.dkgPublish}ms`,
          tokenStake: `${effectiveTimeouts.tokenStake}ms`,
          totalWorkflow: `${effectiveTimeouts.totalWorkflow}ms`
        }
      });

      progressReporter.start();
      progressReporter.report("validation", 1, 5, "Validating request parameters and checking service health");

      // Generate IDs upfront
      const claimId = `claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const noteId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Check cache for similar claims
      const cacheKey = `analysis_${Buffer.from(claim.toLowerCase().trim()).toString('base64').substring(0, 50)}`;
      let analysis: any = null;

      if (WorkflowConfig.caching.enabled) {
        analysis = this.cache.get(cacheKey);
        if (analysis) {
          logger.info("Using cached AI analysis", { cacheKey });
        }
      }

      // Step 1: AI Analysis (with timeout and caching)
      progressReporter.report("ai-analysis", 1, 5, "Performing AI analysis of health claim");
      if (!analysis) {
        logger.info("Step 1: Performing AI analysis (not cached)");
        analysis = await WorkflowConfig.withTimeout(
          this.aiService.analyzeHealthClaim(claim, context),
          effectiveTimeouts.aiAnalysis,
          "AI Analysis"
        );

        // Cache the result
        if (WorkflowConfig.caching.enabled) {
          this.cache.set(cacheKey, analysis);
        }
      } else {
        logger.info("Step 1: Using cached AI analysis");
      }

      // Step 2: Parallel database operations
      progressReporter.report("database-storage", 2, 5, "Storing claim and analysis data");
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
      progressReporter.report("dkg-preparation", 3, 5, "Preparing data for DKG publishing");
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
      progressReporter.report("dkg-publishing", 4, 5, "Publishing to Decentralized Knowledge Graph");
      logger.info("Step 4: Publishing to DKG");
      const publishResult = await WorkflowConfig.withTimeout(
        this.dkgService.publishKnowledgeAsset(noteData, "public"),
        effectiveTimeouts.dkgPublish,
        "DKG Publishing"
      );
      const ual = publishResult.UAL;

      // Step 5: Parallel operations - Store community note and stake tokens
      progressReporter.report("finalization", 5, 5, "Finalizing workflow with staking and note storage");
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
        WorkflowConfig.fastMode.skipStaking && WorkflowConfig.performanceMode === 'fast'
          ? Promise.resolve({ stakeId: `skipped_${Date.now()}` })
          : WorkflowConfig.withTimeout(
              this.tokenomicsService.stakeTokens(stakeRequest),
              effectiveTimeouts.tokenStake,
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
      results.aiService = !!this.aiService;
    } catch (error) {
      logger.warn("AI service health check failed", { error });
    }

    try {
      // Check DKG service (simple availability check)
      results.dkgService = !!this.dkgService;
    } catch (error) {
      logger.warn("DKG service health check failed", { error });
    }

    try {
      // Check tokenomics service
      results.tokenomicsService = !!this.tokenomicsService;
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
}
