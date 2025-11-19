import { defineDkgPlugin } from "@dkg/plugins";
import { config as dotenvConfig } from "dotenv";
import path from "path";
import { loadConfig, type MedsyConfig } from "./config";
import type { IAIAnalysisService, IDkgService, ITokenomicsService, IPaymentService, IMetricsService } from "./types";
import type { LiteratureService } from "./services";
import { initializeServices, shutdownServices, ServiceContainer } from "./services";
import { db } from "./database";

// Import tools
import { registerAnalyzeClaimTool } from "./tools/analyzeClaim";
import { registerPublishNoteTool } from "./tools/publishNote";
import { registerGetNoteTool } from "./tools/getNote";
import { registerStakeTokensTool } from "./tools/stakeTokens";
import { registerPremiumAccessTool } from "./tools/premiumAccess";
import { registerGetPremiumAnalysisTool } from "./tools/getPremiumAnalysis";
import { registerCompletePaymentTool } from "./tools/completePayment";
import { registerDistributeRewardsTool } from "./tools/distributeRewards";
import { registerAutonomousAnalysisTool } from "./tools/autonomousAnalysis";

// Helper function to safely parse sources JSON
function parseSources(sourcesJson: string | null): string[] {
  if (!sourcesJson) return [];
  try {
    const parsed = JSON.parse(sourcesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Services container for managing dependencies
let serviceContainer: ServiceContainer | null = null;

/**
 * Medsy Plugin
 *
 * AI-powered medical assistant for health claims verification and community-driven fact-checking
 * Features:
 * - AI-powered health claim analysis
 * - Decentralized community notes with DKG publishing
 * - Tokenomics-powered trust and staking system
 * - Premium access with micropayments
 */
export default defineDkgPlugin((ctx, mcp, api) => {
  const pluginInitTime = Date.now();
  console.log(
    `Medsy Plugin executing at ${new Date().toISOString()} (${pluginInitTime})`,
  );

  // Load configuration from package root .env file
  const envPath = path.resolve(__dirname, "..", ".env.medsy");
  console.log(`Loading Medsy config from: ${envPath}`);
  dotenvConfig({ path: envPath });

  console.log(`MEDSY_DATABASE_PATH found: ${!!process.env.MEDSY_DATABASE_PATH}`);

  // Initialize services if configuration is provided
  const config: MedsyConfig = loadConfig();
  console.log(`Initializing Medsy services... (${Date.now()})`);

  // Initialize services
  initializeServices(config, ctx)
    .then((container) => {
      serviceContainer = container;

      console.log(`Medsy Plugin ready!`);
      console.log(`   - Database: ${config.database.path}`);
      console.log(`   - AI Provider: ${config.ai?.provider || 'Not configured'}`);
      console.log(`   - DKG Endpoint: ${config.dkg?.endpoint || 'Not configured'}`);

      // Register MCP tools using modular functions
      const aiService = container.get<IAIAnalysisService>("aiService");
      const dkgService = container.get<IDkgService>("dkgService");
      const tokenomicsService = container.get<ITokenomicsService>("tokenomicsService");
      const paymentService = container.get<IPaymentService>("paymentService");
      const literatureService = container.get<LiteratureService>("literatureService");

      registerAnalyzeClaimTool(mcp, ctx, aiService, db);
      registerAutonomousAnalysisTool(mcp, ctx, { aiService, dkgService, tokenomicsService });
      registerPublishNoteTool(mcp, ctx, dkgService, db);
      registerGetNoteTool(mcp, ctx, dkgService, aiService, literatureService, db);
      registerStakeTokensTool(mcp, ctx, tokenomicsService, db);
      registerPremiumAccessTool(mcp, ctx, tokenomicsService, db); // Use tokenomics service like staking
      registerGetPremiumAnalysisTool(mcp, ctx, literatureService, db);
      registerCompletePaymentTool(mcp, ctx, paymentService, db);
      registerDistributeRewardsTool(mcp, ctx, tokenomicsService);

      // Initialize x402 service (lazy load to avoid import issues)
      const initializeX402 = async () => {
        const { X402PaymentService } = await import("./services/x402PaymentService.js");
        const x402Service = new X402PaymentService();
        await x402Service.initialize();
        return x402Service;
      };
    })
    .catch((error) => {
      console.error("Medsy Plugin initialization failed:", error);
    });

  // Register API routes
  (async () => {
    const { registerAllRoutes } = await import("./routes/index.js");
    registerAllRoutes(api, serviceContainer);
  })();
});

// Cleanup function
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down Medsy services...`);

  if (serviceContainer) {
    await shutdownServices(serviceContainer);
    console.log("Medsy services shut down gracefully");
  }

  // Reset initialization state
  serviceContainer = null;

  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Export types
export type {
  MedsyConfig,
} from "./config";
export type {
  HealthClaim,
  AnalysisResult,
  CommunityNote,
  Stake,
  StakeResult,
  PremiumAccess,
  ConsensusData,
} from "./types";
