import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import { AutonomousAnalysisSchema } from "../types";
import { createServiceLogger } from "../services/Logger";
import { requireAuthenticatedAgent } from "../services/agentAuthService";
import { AutonomousWorkflowService } from "../services/autonomousWorkflowService";

const logger = createServiceLogger("autonomousAnalysisTool");

/**
 * Sanitize URL to ensure ASCII characters (prevent unicode dash issues)
 */
function sanitizeUrl(url: string): string {
  return url.replace(/[\u2010-\u2015\u2212]/g, '-'); // Replace unicode dashes with ASCII hyphens
}

/**
 * Autonomous Health Claim Analysis MCP Tool
 * Executes complete analysis-to-reward workflow without manual intervention
 */
export function registerAutonomousAnalysisTool(
  mcp: McpServer,
  ctx: DkgContext,
  services: {
    aiService: any;
    dkgService: any;
    tokenomicsService: any;
  }
) {
  // Initialize autonomous workflow service
  const workflowService = new AutonomousWorkflowService();
  workflowService.initialize(services);

  mcp.registerTool(
    "autonomous-health-claim-analysis",
    {
      title: "Autonomous Health Claim Analysis",
      description: "Complete autonomous health claim analysis: AI analysis → DKG publishing → community staking → reward distribution. No manual intervention required.",
      inputSchema: AutonomousAnalysisSchema.shape
    },
    async ({ claim, context }) => {
      try {
        logger.info("Starting autonomous health claim analysis", {
          claimLength: claim.length,
          hasContext: !!context
        });

        // Authenticate agent
        const agent = requireAuthenticatedAgent(ctx);
        if (!agent) {
          return {
            content: [{ type: "text", text: "Agent authentication required for autonomous analysis" }],
            isError: true
          };
        }

        logger.info("Authenticated agent for autonomous analysis", {
          agentId: agent.agentId,
          name: agent.name
        });

        // Execute complete autonomous workflow
        const result = await workflowService.executeHealthClaimWorkflow(agent, claim, context);

        if (!result.success) {
          const errorMessage = result.errors.join("; ");
          logger.error("Autonomous workflow failed", { errors: result.errors });
          return {
            content: [{
              type: "text",
              text: `❌ Autonomous analysis failed: ${errorMessage}\n\nExecution time: ${result.executionTime}ms`
            }],
            isError: true
          };
        }

        // Return structured data for LLM to format nicely and offer premium access
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              analysisType: "autonomous",
              claim: claim,
              context: context,
              workflowResult: {
                claimId: result.claimId,
                noteId: result.noteId,
                ual: result.ual,
                stakeId: result.stakeId,
                executionTime: result.executionTime,
                agent: {
                  name: agent.name,
                  agentId: agent.agentId
                }
              },
              status: "completed",
              message: "Health claim analysis completed with DKG publishing and auto-staking. Ready for premium access enhancement."
            })
          }],
          workflowResult: result,
          claimId: result.claimId,
          noteId: result.noteId,
          ual: result.ual,
          stakeId: result.stakeId
        };

      } catch (error) {
        logger.error("Autonomous analysis tool failed", { error });
        return {
          content: [{
            type: "text",
            text: `❌ Autonomous analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );
}
