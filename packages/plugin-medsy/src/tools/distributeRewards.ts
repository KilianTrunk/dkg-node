import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import { z } from "zod";
import type { ITokenomicsService } from "../types";

/**
 * Distribute Rewards MCP Tool
 * Allows triggering reward distribution for accurate agents
 */
export function registerDistributeRewardsTool(
  mcp: McpServer,
  ctx: DkgContext,
  tokenomicsService: ITokenomicsService
) {
  mcp.registerTool(
    "distribute-agent-rewards",
    {
      title: "Distribute Agent Rewards",
      description: "Calculate and distribute TRAC token rewards to AI agents that provided accurate health claim analyses based on community consensus",
      inputSchema: z.object({
        noteId: z.string().describe("ID of the community note to evaluate for rewards"),
        finalVerdict: z.enum(["true", "false", "misleading", "uncertain"]).describe("Final community consensus verdict for the health claim")
      }).shape
    },
    async ({ noteId, finalVerdict }) => {
      try {
        console.log(`🎯 Triggering reward distribution for note ${noteId} with verdict: ${finalVerdict}`);

        // Calculate and distribute rewards
        const rewardResult = await tokenomicsService.calculateRewards(noteId, finalVerdict);

        if (rewardResult.totalRewards === 0) {
          return {
            content: [{
              type: "text",
              text: `No rewards distributed for note ${noteId}. Either no accurate agents were found or no staking occurred.`
            }],
            rewardResult
          };
        }

        // Generate explorer links for reward transactions
        const network = process.env.DKG_BLOCKCHAIN?.includes('20430') ? 'neuroweb-testnet' : 'neuroweb';
        const baseUrl = `https://${network}.subscan.io`;

        // Format the response with transaction links
        const rewardSummary = rewardResult.individualRewards.map((reward: { agentId: string; amount: number; accuracy: number; transactionHash?: string }) => {
          const txUrl = reward.transactionHash ? `${baseUrl}/tx/${reward.transactionHash}` : 'Pending';
          const txLink = reward.transactionHash ? `🔗 [View Transaction](${txUrl})` : '';
          return `- Agent ${reward.agentId}: ${reward.amount} TRAC (${(reward.accuracy * 100).toFixed(1)}% accuracy) ${txLink}`;
        }).join('\n');

        const response = `🏆 **Agent Reward Distribution Complete**

**Note ID:** ${noteId}
**Final Verdict:** ${finalVerdict}
**Total Reward Pool:** ${rewardResult.totalRewards} TRAC
**Agents Rewarded:** ${rewardResult.individualRewards.length}

**Individual Rewards:**
${rewardSummary}

**Consensus Accuracy:** ${(rewardResult.consensusAccuracy * 100).toFixed(1)}%

All rewards have been transferred to agent wallets and recorded in the database for full transparency.`;

        // Create structured explorer links for all reward transactions
        const explorerLinks = rewardResult.individualRewards
          .filter((reward: { transactionHash?: string }) => reward.transactionHash)
          .map((reward: { agentId: string; amount: number; transactionHash?: string }) => ({
            agentId: reward.agentId,
            amount: reward.amount,
            transaction: reward.transactionHash ? `${baseUrl}/tx/${reward.transactionHash}` : null
          }));

        return {
          content: [{ type: "text", text: response }],
          rewardResult,
          explorerLinks,
          success: true
        };

      } catch (error: any) {
        console.error("Reward distribution failed:", error);
        return {
          content: [{
            type: "text",
            text: `❌ Reward distribution failed: ${error.message || "Please try again."}`
          }],
          isError: true
        };
      }
    }
  );
}
