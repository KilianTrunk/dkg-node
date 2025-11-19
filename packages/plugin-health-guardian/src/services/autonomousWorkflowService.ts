/**
 * Autonomous Workflow Service
 * Provides a clean interface to the workflow orchestrator
 */

import { createServiceLogger } from "./Logger";
import type { AgentIdentity } from "./agentAuthService";
import type { WorkflowResult, ProgressCallback } from "../types";
import { WorkflowOrchestrator } from "./WorkflowOrchestrator";

const logger = createServiceLogger("AutonomousWorkflowService");

/**
 * Legacy wrapper for backward compatibility
 * @deprecated Use WorkflowOrchestrator directly for new code
 */
export class AutonomousWorkflowService {
  private orchestrator!: WorkflowOrchestrator;

  async initialize(services: any) {
    this.orchestrator = new WorkflowOrchestrator();
    await this.orchestrator.initialize(services);
    logger.info("AutonomousWorkflowService initialized");
  }

  async executeHealthClaimWorkflow(
    agent: AgentIdentity,
    claim: string,
    context?: string,
    progressCallback?: ProgressCallback
  ): Promise<WorkflowResult> {
    return this.orchestrator.executeHealthClaimWorkflow(agent, claim, context, progressCallback);
  }

  async executeRewardDistributionWorkflow(noteId: string): Promise<WorkflowResult> {
    return this.orchestrator.executeRewardDistributionWorkflow(noteId);
  }

  async executeMaintenanceWorkflow(): Promise<void> {
    return this.orchestrator.executeMaintenanceWorkflow();
  }

  async getConsensusVerdict(noteId: string) {
    return this.orchestrator.getConsensusVerdict(noteId);
  }

  async performHealthChecks() {
    return this.orchestrator.performHealthChecks();
  }

  isInitialized(): boolean {
    return this.orchestrator?.isInitialized() ?? false;
  }
}

/**
 * Helper function to execute autonomous health claim analysis
 * @deprecated Use WorkflowOrchestrator directly
 */
export async function executeAutonomousHealthAnalysis(
  agent: AgentIdentity,
  claim: string,
  context?: string,
  progressCallback?: ProgressCallback
): Promise<WorkflowResult> {
  throw new Error("Use WorkflowOrchestrator directly for autonomous workflow execution");
}

// Re-export types and interfaces for backward compatibility
export type { WorkflowResult, ProgressCallback } from "../types";
