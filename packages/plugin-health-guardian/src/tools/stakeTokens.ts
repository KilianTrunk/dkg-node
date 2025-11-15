import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import { sql } from "drizzle-orm";
import { StakeSchema } from "../types";
import { TokenomicsService } from "../services/tokenomicsService";
import { stakes } from "../database";

/**
 * Stake Tokens on Health Note MCP Tool
 */
export function registerStakeTokensTool(
  mcp: McpServer,
  ctx: DkgContext,
  tokenomicsService: TokenomicsService,
  db: any // TODO: Replace with proper database type
) {
  mcp.registerTool(
    "stake-on-health-note",
    {
      title: "Stake on Health Note",
      description: "Stake TRAC tokens to support or oppose a health community note",
      inputSchema: StakeSchema.shape
    },
    async ({ noteId, amount, position, reasoning }) => {
      try {
        // In real implementation, get userId from auth context
        const userId = "demo_user"; // Mock user ID

        // Check if user already staked on this note
        const existingStakes = await db.select()
          .from(stakes)
          .where(db.sql`${stakes.noteId} = ${noteId} AND ${stakes.userId} = ${userId}`);

        if (existingStakes.length > 0) {
          return {
            content: [{ type: "text", text: "You have already staked on this note." }],
            isError: true
          };
        }

        // Stake tokens using tokenomics service
        const stakeResult = await tokenomicsService.stakeTokens(noteId, userId, amount, position, reasoning);

        // Record stake in database
        await db.insert(stakes).values({
          noteId,
          userId,
          amount,
          position,
          reasoning: reasoning || null,
          createdAt: new Date(),
        });

        return {
          content: [{
            type: "text",
            text: `Successfully staked ${amount} TRAC tokens ${position === 'support' ? 'in support of' : 'against'} this health note.\n\nCommunity Consensus:\n- Support: ${stakeResult.communityConsensus.support} TRAC\n- Oppose: ${stakeResult.communityConsensus.oppose} TRAC\n- Total Stakes: ${stakeResult.communityConsensus.support + stakeResult.communityConsensus.oppose}`
          }],
          stakeId: stakeResult.stakeId,
          communityConsensus: stakeResult.communityConsensus
        };
      } catch (error) {
        console.error("Staking failed:", error);
        return {
          content: [{ type: "text", text: "Failed to record stake. Please try again." }],
          isError: true
        };
      }
    }
  );
}
