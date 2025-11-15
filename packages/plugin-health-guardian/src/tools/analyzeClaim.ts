import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import { AnalyzeClaimSchema } from "../types";
import { AIAnalysisService } from "../services/aiAnalysis";
import { healthClaims } from "../database";

/**
 * Analyze Health Claim MCP Tool
 */
export function registerAnalyzeClaimTool(
  mcp: McpServer,
  ctx: DkgContext,
  aiService: AIAnalysisService,
  db: any // TODO: Replace with proper database type
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

        return {
          content: [{
            type: "text",
            text: `Health Claim Analysis:\n\nClaim: ${claim}\nVerdict: ${analysis.verdict.toUpperCase()}\nConfidence: ${(analysis.confidence * 100).toFixed(1)}%\n\nSummary: ${analysis.summary}\n\nSources: ${analysis.sources.join(", ")}\n\nClaim ID: ${claimId} (save this for publishing)`
          }],
          claimId,
          analysis
        };
      } catch (error) {
        console.error("Health claim analysis failed:", error);
        return {
          content: [{ type: "text", text: "Analysis failed. Please try again." }],
          isError: true
        };
      }
    }
  );
}
