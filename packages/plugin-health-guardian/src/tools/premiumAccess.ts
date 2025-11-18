import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { PremiumAccessSchema } from "../types";
import { IPaymentService } from "../types";
import { premiumAccess, communityNotes } from "../database";
import * as schema from "../database/schema";

/**
 * Premium Access MCP Tool
 */
export function registerPremiumAccessTool(
  mcp: McpServer,
  ctx: DkgContext,
  paymentService: IPaymentService,
  db: BetterSQLite3Database<typeof schema>
) {
  mcp.registerTool(
    "access-premium-health-insights",
    {
      title: "Access Premium Health Insights",
      description: "Pay for premium access to detailed health analysis and expert insights",
      inputSchema: PremiumAccessSchema.shape
    },
    async ({ noteId, paymentAmount }) => {
      try {
        const userId = "demo_user"; // Mock user ID

        // Check if user already has premium access
        const existingAccess = await db.select()
          .from(premiumAccess)
          .where(sql`${premiumAccess.noteId} = ${noteId} AND ${premiumAccess.userId} = ${userId} AND ${premiumAccess.expiresAt} > datetime('now')`);

        if (existingAccess.length > 0) {
          return {
            content: [{ type: "text", text: "You already have premium access to this note." }],
            isError: true
          };
        }

        // Process TRAC payment immediately (like staking)
        const paymentResult = await paymentService.processPremiumAccess(userId, noteId, paymentAmount);

        // Record premium access in database
        await db.insert(premiumAccess).values({
          userId,
          noteId,
          paymentAmount,
          grantedAt: paymentResult.grantedAt,
          expiresAt: paymentResult.expiresAt
        });

        // Generate transaction URL for tracking
        const network = process.env.DKG_BLOCKCHAIN?.includes('20430') ? 'neuroweb-testnet' : 'neuroweb';
        const baseUrl = `https://${network}.subscan.io`;
        const txUrl = `${baseUrl}/tx/${paymentResult.transactionHash}`;

        return {
          content: [{
            type: "text",
            text: `✅ Premium access granted for ${paymentAmount} TRAC!\n\n🔗 [View Transaction](${txUrl})\n\nYou now have access to:\n- Enhanced analysis methodology\n- Expert medical commentary\n- Related medical studies & citations\n- Statistical confidence intervals\n- Source credibility assessment\n- Bias analysis & limitations\n\nAccess valid until: ${paymentResult.expiresAt.toISOString()}`
          }],
          transactionHash: paymentResult.transactionHash,
          grantedAt: paymentResult.grantedAt,
          expiresAt: paymentResult.expiresAt,
          explorerLink: txUrl
        };
      } catch (error) {
        console.error("Premium access request failed:", error);
        return {
          content: [{ type: "text", text: "Failed to initiate premium access. Please try again." }],
          isError: true
        };
      }
    }
  );
}
