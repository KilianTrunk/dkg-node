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

        // Success response with complete workflow results
        const response = [
          `✅ **Autonomous Health Analysis Complete!**`,
          ``,
          `🤖 **Agent:** ${agent.name} (${agent.agentId})`,
          `📝 **Claim ID:** ${result.claimId}`,
          `📋 **Community Note:** ${result.noteId}`,
          `🔗 **DKG Permanent Record:** ${sanitizeUrl(`https://dkg-testnet.origintrail.io/explore?ual=${encodeURIComponent(result.ual || '')}`)}`,
          `💰 **Auto-Stake:** ${result.stakeId} (1 TRAC)`,
          `⏱️ **Execution Time:** ${result.executionTime}ms`,
          ``,
          `🔄 **Complete Workflow Executed:**`,
          `   1. AI-powered health claim analysis`,
          `   2. DKG Knowledge Asset publishing`,
          `   3. Community note creation`,
          `   4. Automatic TRAC token staking`,
          `   5. Consensus-based reward distribution (when threshold reached)`,
          ``,
          `📊 **Analysis Results:**`
        ];

        // Add analysis details from the published note
        // In a real implementation, we'd retrieve this from the DKG
        response.push(`   - Claim: "${claim.substring(0, 100)}${claim.length > 100 ? '...' : ''}"`);
        response.push(`   - Status: Published and staked`);
        response.push(`   - Consensus: Building... (minimum 3 stakes required)`);
        response.push(``);
        response.push(`🎯 **Next Steps:**`);
        response.push(`   - Other agents can stake on this note for consensus`);
        response.push(`   - Once consensus is reached, rewards will be distributed automatically`);
        response.push(`   - Premium access available via x402 micropayments`);

        return {
          content: [{ type: "text", text: response.join('\n') }],
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
