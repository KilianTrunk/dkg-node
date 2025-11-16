import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { AnalyzeClaimSchema, IAIAnalysisService } from "../types";
import { healthClaims } from "../database";
import * as schema from "../database/schema";
import { createServiceLogger } from "../services/Logger";

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

        const analysis = await aiService.analyzeHealthClaim(claim, context);

        // Store claim in database for tracking
        const claimId = `claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.insert(healthClaims).values({
          claimId,
          claim,
          status: "analyzing",
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        logger.info("Health claim analyzed and stored", { claimId, verdict: analysis.verdict });

        return {
          content: [{
            type: "text",
            text: `Health Claim Analysis:\n\nClaim: ${claim}\nVerdict: ${analysis.verdict.toUpperCase()}\nConfidence: ${(analysis.confidence * 100).toFixed(1)}%\n\nSummary: ${analysis.summary}\n\nSources: ${analysis.sources.join(", ")}\n\nClaim ID: ${claimId} (save this for publishing)`
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
