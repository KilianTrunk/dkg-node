import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { AnalyzeClaimSchema, IAIAnalysisService } from "../types";
import { healthClaims } from "../database";
import * as schema from "../database/schema";
import { createServiceLogger } from "../services/Logger";
import { requireAuthenticatedAgent } from "../services/agentAuthService";

const logger = createServiceLogger("AnalyzeClaimTool");

/**
 * Analyze Health Claim MCP Tool
 */
export function registerAnalyzeClaimTool(
  mcp: McpServer,
  ctx: DkgContext,
  aiService: IAIAnalysisService,
  db: BetterSQLite3Database<typeof schema>
) {
  // Initialize agent auth service
  const { AgentAuthService } = require("../services/agentAuthService");
  const agentAuthService = new AgentAuthService();
  mcp.registerTool(
    "analyze-health-claim",
    {
      title: "Analyze Health Claim",
      description: "Use AI to analyze a health claim and provide verification assessment",
      inputSchema: AnalyzeClaimSchema.shape
    },
    async ({ claim, context }) => {
      try {
        logger.info("Analyzing health claim", { claimLength: claim.length, hasContext: !!context });

        // Authenticate agent
        const agent = requireAuthenticatedAgent(ctx);
        if (!agent) {
          return {
            content: [{ type: "text", text: "Agent authentication required" }],
            isError: true
          };
        }

        logger.info("Authenticated agent for analysis", {
          agentId: agent.agentId,
          name: agent.name,
          walletAddress: agent.walletAddress
        });

        const analysis = await aiService.analyzeHealthClaim(claim, context);

        // Store claim and analysis in database for tracking and rewards
        const claimId = `claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const agentId = agent.agentId;

        await db.insert(healthClaims).values({
          claimId,
          claim,
          status: "analyzing",
          agentId,
          verdict: analysis.verdict,
          confidence: analysis.confidence,
          analysis: JSON.stringify(analysis), // Store full analysis as JSON
          analyzedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        logger.info("Health claim analyzed and stored", { claimId, verdict: analysis.verdict });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              analysisType: "basic",
              claim: claim,
              context: context,
              analysis: {
                verdict: analysis.verdict,
                confidence: analysis.confidence,
                summary: analysis.summary,
                sources: analysis.sources
              },
              claimId: claimId,
              status: "analyzed",
              message: "Basic health claim analysis completed. Ready for publishing as community note."
            })
          }],
          claimId,
          analysis
        };
      } catch (error: any) {
        logger.error("Health claim analysis failed", { error: error.message, claim: claim.substring(0, 100) + "..." });
        return {
          content: [{ type: "text", text: `Analysis failed: ${error.message || "Please try again."}` }],
          isError: true
        };
      }
    }
  );
}
