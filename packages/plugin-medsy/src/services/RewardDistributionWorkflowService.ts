import { createServiceLogger } from "./Logger";
import type { ITokenomicsService } from "../types";
import type { WorkflowResult } from "../types";
import { ConsensusService } from "./ConsensusService";

const logger = createServiceLogger("RewardDistributionWorkflowService");

/**
 * Service for executing reward distribution workflows
 */
export class RewardDistributionWorkflowService {
  private tokenomicsService!: ITokenomicsService;
  private consensusService!: ConsensusService;

  async initialize(services: {
    tokenomicsService: ITokenomicsService;
    consensusService: ConsensusService;
  }) {
    this.tokenomicsService = services.tokenomicsService;
    this.consensusService = services.consensusService;
    logger.info("RewardDistributionWorkflowService initialized");
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
      const consensus = await this.consensusService.getConsensusVerdict(noteId);
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
}
