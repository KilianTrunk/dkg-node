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
            text: `Health Claim Analysis:\n\nClaim: ${claim}\nVerdict: ${analysis.verdict.toUpperCase()}\nConfidence: ${(analysis.confidence * 100).toFixed(1)}%\n\nSummary: ${analysis.summary}\n\nSources: ${analysis.sources.join(", ")}\n\nClaim ID: ${claimId} (save this for publishing)\n\n💎 **Want premium access?** First publish this as a Community Note, then pay 1 TRAC for enhanced analysis with expert commentary, medical citations, statistical data, and bias assessment.\n\nLet me know if you'd like me to publish this note!`
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
