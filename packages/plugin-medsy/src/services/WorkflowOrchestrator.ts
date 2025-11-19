import { createServiceLogger } from "./Logger";
import type { AgentIdentity } from "./agentAuthService";
import type { IAIAnalysisService, IDkgService, ITokenomicsService } from "../types";
import type { WorkflowResult, ProgressCallback } from "../types";
import { HealthClaimWorkflowService } from "./HealthClaimWorkflowService";
import { RewardDistributionWorkflowService } from "./RewardDistributionWorkflowService";
import { MaintenanceWorkflowService } from "./MaintenanceWorkflowService";
import { ConsensusService } from "./ConsensusService";

const logger = createServiceLogger("WorkflowOrchestrator");

/**
 * Orchestrator for all medsy workflows
 * Provides a clean interface for executing complex workflows
 */
export class WorkflowOrchestrator {
  private healthClaimWorkflow!: HealthClaimWorkflowService;
  private rewardDistributionWorkflow!: RewardDistributionWorkflowService;
  private maintenanceWorkflow!: MaintenanceWorkflowService;
  private consensusService!: ConsensusService;
  private initialized = false;

  async initialize(services: {
    aiService: IAIAnalysisService;
    dkgService: IDkgService;
    tokenomicsService: ITokenomicsService;
  }) {
    this.healthClaimWorkflow = new HealthClaimWorkflowService();
    this.rewardDistributionWorkflow = new RewardDistributionWorkflowService();
    this.maintenanceWorkflow = new MaintenanceWorkflowService();
    this.consensusService = new ConsensusService();

    await Promise.all([
      this.healthClaimWorkflow.initialize(services),
      this.rewardDistributionWorkflow.initialize({
        tokenomicsService: services.tokenomicsService,
        consensusService: this.consensusService
      })
    ]);

    this.initialized = true;
    logger.info("WorkflowOrchestrator initialized");
  }

  /**
   * Execute health claim analysis workflow
   */
  async executeHealthClaimWorkflow(
    agent: AgentIdentity,
    claim: string,
    context?: string,
    progressCallback?: ProgressCallback
  ): Promise<WorkflowResult> {
    this.checkInitialized();
    return this.healthClaimWorkflow.executeHealthClaimWorkflow(agent, claim, context, progressCallback);
  }

  /**
   * Execute reward distribution workflow
   */
  async executeRewardDistributionWorkflow(noteId: string): Promise<WorkflowResult> {
    this.checkInitialized();
    return this.rewardDistributionWorkflow.executeRewardDistributionWorkflow(noteId);
  }

  /**
   * Execute maintenance workflow
   */
  async executeMaintenanceWorkflow(): Promise<void> {
    this.checkInitialized();
    return this.maintenanceWorkflow.executeMaintenanceWorkflow();
  }

  /**
   * Get consensus verdict for a note
   */
  async getConsensusVerdict(noteId: string) {
    this.checkInitialized();
    return this.consensusService.getConsensusVerdict(noteId);
  }

  /**
   * Perform health checks
   */
  async performHealthChecks() {
    this.checkInitialized();
    return this.healthClaimWorkflow.performHealthChecks();
  }

  /**
   * Check if service is properly initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  private checkInitialized(): void {
    if (!this.initialized) {
      throw new Error("WorkflowOrchestrator not initialized");
    }
  }
}
