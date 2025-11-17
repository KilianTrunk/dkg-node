import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { StakeSchema, StakeRequest } from "../types";
import { ITokenomicsService } from "../types";
import { stakes } from "../database";
import * as schema from "../database/schema";

/**
 * Stake Tokens on Health Note MCP Tool
 */
export function registerStakeTokensTool(
  mcp: McpServer,
  ctx: DkgContext,
  tokenomicsService: ITokenomicsService,
  db: BetterSQLite3Database<typeof schema>
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
        const userId = "demo_user"; // Mock user ID

        // Check if user already staked on this note
        const existingStakes = await db.select()
          .from(stakes)
          .where(sql`${stakes.noteId} = ${noteId} AND ${stakes.userId} = ${userId}`);

        if (existingStakes.length > 0) {
          return {
            content: [{ type: "text", text: "You have already staked on this note." }],
            isError: true
          };
        }

        // Stake tokens using tokenomics service
        const stakeResult = await tokenomicsService.stakeTokens({
          noteId,
          amount,
          position,
          reasoning
        });

        // Record stake in database
        await db.insert(stakes).values({
          noteId,
          userId,
          amount,
          position,
          reasoning: reasoning || null,
          createdAt: new Date(),
        });

        // Generate explorer links based on network
        const network = process.env.DKG_BLOCKCHAIN?.includes('20430') ? 'neuroweb-testnet' : 'neuroweb';
        const baseUrl = `https://${network}.subscan.io`;
        const txUrl = `${baseUrl}/tx/${stakeResult.transactionHash}`;

        return {
          content: [{
            type: "text",
            text: `Successfully staked ${amount} TRAC tokens ${position === 'support' ? 'in support of' : 'against'} this health note.\n\nCommunity Consensus:\n- Support: ${stakeResult.communityConsensus.support} TRAC\n- Oppose: ${stakeResult.communityConsensus.oppose} TRAC\n- Total Stakes: ${stakeResult.communityConsensus.support + stakeResult.communityConsensus.oppose}\n\n🔗 View Transaction: ${txUrl}`
          }],
          stakeId: stakeResult.stakeId,
          communityConsensus: stakeResult.communityConsensus,
          transactionHash: stakeResult.transactionHash,
          explorerLinks: {
            transaction: txUrl
          }
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
