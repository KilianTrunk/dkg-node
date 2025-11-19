import { defineDkgPlugin } from "@dkg/plugins";
import { openAPIRoute, z } from "@dkg/plugin-swagger";
import { eq, desc, sql } from "drizzle-orm";
import { config as dotenvConfig } from "dotenv";
import path from "path";
import { loadConfig, type HealthGuardianConfig } from "./config";
import type { IAIAnalysisService, IDkgService, ITokenomicsService, IPaymentService, IMetricsService } from "./types";
import type { LiteratureService } from "./services";
import { initializeServices, shutdownServices, ServiceContainer } from "./services";
import { db, healthClaims, communityNotes, stakes, premiumAccess, agentRewards } from "./database";

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
 * Health Guardian Plugin
 *
 * Enterprise-grade system for health claims verification and community-driven fact-checking
 * Features:
 * - AI-powered health claim analysis
 * - Decentralized community notes with DKG publishing
 * - Tokenomics-powered trust and staking system
 * - Premium access with micropayments
 */
export default defineDkgPlugin((ctx, mcp, api) => {
  const pluginInitTime = Date.now();
  console.log(
    `Health Guardian Plugin executing at ${new Date().toISOString()} (${pluginInitTime})`,
  );

  // Load configuration from package root .env file
  const envPath = path.resolve(__dirname, "..", ".env.health-guardian");
  console.log(`Loading Health Guardian config from: ${envPath}`);
  dotenvConfig({ path: envPath });

  console.log(`HG_DATABASE_PATH found: ${!!process.env.HG_DATABASE_PATH}`);

  // Initialize services if configuration is provided
  const config: HealthGuardianConfig = loadConfig();
  console.log(`Initializing Health Guardian services... (${Date.now()})`);

  // Initialize services
  initializeServices(config, ctx)
    .then((container) => {
      serviceContainer = container;

      console.log(`Health Guardian Plugin ready!`);
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
      console.error("Health Guardian Plugin initialization failed:", error);
    });

  // API Routes for web interface integration

  // Get health claims
  api.get(
    "/health/claims",
    openAPIRoute(
      {
        tag: "Health Guardian",
        summary: "Get health claims",
        description: "Retrieve analyzed health claims",
        query: z.object({
          limit: z.number({ coerce: true }).optional().default(10),
          offset: z.number({ coerce: true }).optional().default(0),
        }),
        response: {
          description: "List of health claims",
          schema: z.object({
            claims: z.array(z.any()),
            total: z.number(),
          }),
        },
      },
      async (req, res) => {
        if (!serviceContainer) {
          return res
            .status(503)
            .json({ error: "Health Guardian Plugin is starting up" });
        }

        try {
          const { limit = 10, offset = 0 } = req.query;
          const claims = await db.select()
            .from(healthClaims)
            .orderBy(desc(healthClaims.createdAt))
            .limit(limit as number)
            .offset(offset as number);

          const totalResult = await db.select({ count: sql<number>`count(*)` }).from(healthClaims);
          const total = totalResult[0]?.count || 0;

          res.json({ claims, total });
        } catch (error: any) {
          console.error("Failed to fetch health claims:", error);
          res.status(500).json({ error: error.message || "Failed to fetch claims" });
        }
      },
    ),
  );

  // Get community notes
  api.get(
    "/health/notes",
    openAPIRoute(
      {
        tag: "Health Guardian",
        summary: "Get community notes",
        description: "Retrieve published health community notes",
        query: z.object({
          claimId: z.string().optional(),
          limit: z.number({ coerce: true }).optional().default(10),
        }),
        response: {
          description: "List of community notes",
          schema: z.object({
            notes: z.array(z.any()),
          }),
        },
      },
      async (req, res) => {
        if (!serviceContainer) {
          return res
            .status(503)
            .json({ error: "Health Guardian Plugin is starting up" });
        }

        try {
          let notes;
          if (req.query.claimId) {
            notes = await db.select()
              .from(communityNotes)
              .where(eq(communityNotes.claimId, req.query.claimId as string))
              .orderBy(desc(communityNotes.createdAt))
              .limit(req.query.limit as number || 10);
          } else {
            notes = await db.select()
              .from(communityNotes)
              .orderBy(desc(communityNotes.createdAt))
              .limit(req.query.limit as number || 10);
          }

          res.json({ notes });
        } catch (error: any) {
          console.error("Failed to fetch community notes:", error);
          res.status(500).json({ error: error.message || "Failed to fetch notes" });
        }
      },
    ),
  );

  // Get staking information
  api.get(
    "/health/stakes/:noteId",
    openAPIRoute(
      {
        tag: "Health Guardian",
        summary: "Get stakes for a note",
        description: "Retrieve staking information for a community note",
        params: z.object({
          noteId: z.string(),
        }),
        response: {
          description: "Staking information",
          schema: z.object({
            stakes: z.array(z.any()),
            consensus: z.object({
              support: z.number(),
              oppose: z.number(),
            }),
          }),
        },
      },
      async (req, res) => {
        if (!serviceContainer) {
          return res
            .status(503)
            .json({ error: "Health Guardian Plugin is starting up" });
        }

        try {
          const stakeData = await db.select().from(stakes).where(eq(stakes.noteId, req.params.noteId));

          const support = stakeData.filter((s: any) => s.position === "support").reduce((sum: number, s: any) => sum + s.amount, 0);
          const oppose = stakeData.filter((s: any) => s.position === "oppose").reduce((sum: number, s: any) => sum + s.amount, 0);

          res.json({
            stakes: stakeData,
            consensus: { support, oppose }
          });
        } catch (error: any) {
          console.error("Failed to fetch stakes:", error);
          res.status(500).json({ error: error.message || "Failed to fetch stakes" });
        }
      },
    ),
  );

  // Get agent rewards
  api.get(
    "/health/rewards",
    openAPIRoute(
      {
        tag: "Health Guardian",
        summary: "Get agent rewards",
        description: "Retrieve TRAC token rewards distributed to accurate AI agents",
        query: z.object({
          agentId: z.string().optional(),
          noteId: z.string().optional(),
          limit: z.number({ coerce: true }).optional().default(10),
        }),
        response: {
          description: "List of agent rewards",
          schema: z.object({
            rewards: z.array(z.any()),
            total: z.number(),
          }),
        },
      },
      async (req, res) => {
        if (!serviceContainer) {
          return res
            .status(503)
            .json({ error: "Health Guardian Plugin is starting up" });
        }

        try {
          let rewards;
          if (req.query.agentId) {
            rewards = await db.select()
              .from(agentRewards)
              .where(eq(agentRewards.agentId, req.query.agentId as string))
              .orderBy(desc(agentRewards.distributedAt))
              .limit(req.query.limit as number || 10);
          } else if (req.query.noteId) {
            rewards = await db.select()
              .from(agentRewards)
              .where(eq(agentRewards.noteId, req.query.noteId as string))
              .orderBy(desc(agentRewards.distributedAt));
          } else {
            rewards = await db.select()
              .from(agentRewards)
              .orderBy(desc(agentRewards.distributedAt))
              .limit(req.query.limit as number || 10);
          }

          const totalResult = await db.select({ count: sql<number>`count(*)` }).from(agentRewards);
          const total = totalResult[0]?.count || 0;

          res.json({ rewards, total });
        } catch (error: any) {
          console.error("Failed to fetch agent rewards:", error);
          res.status(500).json({ error: error.message || "Failed to fetch rewards" });
        }
      },
    ),
  );

  // Health monitoring and metrics endpoints

  // System health check
  api.get("/health/status", async (_req, res) => {
    if (!serviceContainer) {
      return res.status(503).json({
        status: "starting",
        message: "Health Guardian Plugin is starting up"
      });
    }

    try {
      const metricsService = serviceContainer.get<IMetricsService>("metricsService");
      const health = await metricsService.getSystemHealth();

      res.json(health);
    } catch (error: any) {
      console.error("Health check failed:", error);
      res.status(500).json({
        status: "unhealthy",
        error: error.message || "Health check failed"
      });
    }
  });

  // Detailed metrics endpoints
  api.get("/health/metrics/claims", async (_req, res) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Services not initialized" });
    }

    try {
      const metricsService = serviceContainer.get<IMetricsService>("metricsService");
      const metrics = await metricsService.getClaimsMetrics();
      res.json(metrics);
    } catch (error: any) {
      console.error("Failed to get claims metrics:", error);
      res.status(500).json({ error: error.message });
    }
  });

  api.get("/health/metrics/notes", async (_req, res) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Services not initialized" });
    }

    try {
      const metricsService = serviceContainer.get<IMetricsService>("metricsService");
      const metrics = await metricsService.getNotesMetrics();
      res.json(metrics);
    } catch (error: any) {
      console.error("Failed to get notes metrics:", error);
      res.status(500).json({ error: error.message });
    }
  });

  api.get("/health/metrics/staking", async (_req, res) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Services not initialized" });
    }

    try {
      const metricsService = serviceContainer.get<IMetricsService>("metricsService");
      const metrics = await metricsService.getStakingMetrics();
      res.json(metrics);
    } catch (error: any) {
      console.error("Failed to get staking metrics:", error);
      res.status(500).json({ error: error.message });
    }
  });

  api.get("/health/metrics/premium", async (_req, res) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Services not initialized" });
    }

    try {
      const metricsService = serviceContainer.get<IMetricsService>("metricsService");
      const metrics = await metricsService.getPremiumMetrics();
      res.json(metrics);
    } catch (error: any) {
      console.error("Failed to get premium metrics:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Comprehensive metrics dashboard
  api.get("/health/metrics", async (_req, res) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Services not initialized" });
    }

    try {
      const metricsService = serviceContainer.get<IMetricsService>("metricsService");
      const health = await metricsService.getSystemHealth();
      res.json(health);
    } catch (error: any) {
      console.error("Failed to get comprehensive metrics:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // x402 Payment endpoints
  api.get("/health/x402/pay/:paymentId", async (req, res) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Services not initialized" });
    }

    try {
      const { X402PaymentService } = await import("./services/x402PaymentService.js");
      const x402Service = new X402PaymentService();
      await x402Service.initialize();

      const payment = await x402Service.getPaymentStatus(req.params.paymentId);
      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }

      if (payment.status === "payment_completed") {
        return res.json({
          status: "completed",
          message: "Payment already completed",
          payment
        });
      }

      // Return payment information for client to complete
      res.json({
        status: "pending",
        message: "Complete the payment using your x402-compatible wallet",
        payment: {
          id: payment.paymentId,
          amount: payment.amount,
          currency: payment.currency,
          description: payment.description,
          expiresAt: payment.expiresAt
        }
      });
    } catch (error: any) {
      console.error("Failed to get x402 payment:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Complete x402 payment
  api.post("/health/x402/complete/:paymentId", async (req, res) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Services not initialized" });
    }

    try {
      const { paymentId } = req.params;
      const { transactionHash, payerAddress } = req.body;

      if (!transactionHash || !payerAddress) {
        return res.status(400).json({
          error: "Missing required fields: transactionHash, payerAddress"
        });
      }

      const { X402PaymentService } = await import("./services/x402PaymentService.js");
      const x402Service = new X402PaymentService();
      await x402Service.initialize();

      const payment = await x402Service.processPayment(paymentId, payerAddress, transactionHash);

      if (payment.status === "payment_completed") {
        // Grant premium access
        const userId = "demo_user"; // In production, get from auth
        const paymentService = serviceContainer.get<IPaymentService>("paymentService");

        // Extract noteId from payment description
        const noteIdMatch = payment.description.match(/note (\w+)/);
        const noteId = noteIdMatch ? noteIdMatch[1] : "unknown";

        const accessResult = await paymentService.processPremiumAccess(paymentId, payerAddress, transactionHash);

        // Record premium access in database
        await db.insert(premiumAccess).values({
          userId,
          noteId: noteId || "unknown",
          paymentAmount: parseFloat(payment.amount),
          grantedAt: accessResult.grantedAt,
          expiresAt: accessResult.expiresAt
        });

        res.json({
          status: "success",
          message: "Premium access granted",
          payment,
          access: {
            grantedAt: accessResult.grantedAt,
            expiresAt: accessResult.expiresAt,
            transactionHash: accessResult.transactionHash
          }
        });
      } else {
        res.status(402).json({
          status: "pending",
          message: "Payment verification in progress",
          payment
        });
      }
    } catch (error: any) {
      console.error("Failed to complete x402 payment:", error);
      res.status(500).json({ error: error.message });
    }
  });
});

// Cleanup function
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down Health Guardian services...`);

  if (serviceContainer) {
    await shutdownServices(serviceContainer);
    console.log("Health Guardian services shut down gracefully");
  }

  // Reset initialization state
  serviceContainer = null;

  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Export types
export type {
  HealthGuardianConfig,
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
