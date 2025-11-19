import { ServiceContainer } from "./ServiceContainer";
import { db } from "../database";
import { AIAnalysisService } from "./aiAnalysis";
import { DkgService } from "./dkgService";
import { TokenomicsService } from "./tokenomicsService";
import { PaymentService } from "./paymentService";
import { MetricsService } from "./MetricsService";
import { LiteratureService } from "./literatureService";
import type { MedsyConfig } from "../config";

export type ServiceConfig = MedsyConfig;

/**
 * Initialize all services and register them in the container
 */
export async function initializeServices(
  config: ServiceConfig,
  dkgContext?: any
): Promise<ServiceContainer> {
  console.log(`Medsy Plugin services initialization at ${Date.now()}`);
  const container = new ServiceContainer();

  // Register database
  container.register("db", db);

  // Initialize AI Analysis Service
  const aiService = new AIAnalysisService();
  container.register("aiService", aiService);

  // Initialize DKG Service
  const dkgService = new DkgService();
  container.register("dkgService", dkgService);

  // Initialize Tokenomics Service
  const tokenomicsService = new TokenomicsService();
  container.register("tokenomicsService", tokenomicsService);

  // Initialize Payment Service
  const paymentService = new PaymentService();
  container.register("paymentService", paymentService);

  // Initialize Metrics Service
  const metricsService = new MetricsService();
  container.register("metricsService", metricsService);

  // Initialize Literature Service
  const literatureService = new LiteratureService();
  container.register("literatureService", literatureService);

  // Initialize all services asynchronously
  try {
    await Promise.all([
      aiService.initializeAIClient(),
      dkgService.initialize(dkgContext),
      tokenomicsService.initialize(),
      paymentService.initialize(),
      literatureService.initialize()
    ]);
    console.log("All Medsy services initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Medsy services:", error);
    throw error;
  }

  return container;
}

/**
 * Gracefully shutdown all services
 */
export async function shutdownServices(
  container: ServiceContainer,
): Promise<void> {
  try {
    console.log("🔄 Shutting down Medsy services...");

    // Shutdown services in reverse order if needed
    // Most services are stateless and don't need special shutdown

    // Clear container
    container.clear();

    console.log("Medsy services shut down gracefully");
  } catch (error) {
    console.error("Error during Medsy service shutdown:", error);
  }
}

// Re-export all services for convenience
export { ServiceContainer } from "./ServiceContainer";
export { AIAnalysisService } from "./aiAnalysis";
export { DkgService } from "./dkgService";
export { TokenomicsService } from "./tokenomicsService";
export { PaymentService } from "./paymentService";
export { MetricsService } from "./MetricsService";
export { LiteratureService } from "./literatureService";
export { WorkflowOrchestrator } from "./WorkflowOrchestrator";
export { HealthClaimWorkflowService } from "./HealthClaimWorkflowService";
export { RewardDistributionWorkflowService } from "./RewardDistributionWorkflowService";
export { MaintenanceWorkflowService } from "./MaintenanceWorkflowService";
export { ConsensusService } from "./ConsensusService";
export { WorkflowConfig } from "./WorkflowConfig";
export { WorkflowCache } from "./WorkflowCache";
export { ProgressReporter } from "./ProgressReporter";
