import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import { sql } from "drizzle-orm";
import { PremiumAccessSchema } from "../types";
import { PaymentService } from "../services/paymentService";
import { premiumAccess, communityNotes } from "../database";

/**
 * Premium Access MCP Tool
 */
export function registerPremiumAccessTool(
  mcp: McpServer,
  ctx: DkgContext,
  paymentService: PaymentService,
  db: any // TODO: Replace with proper database type
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
        // In real implementation, get userId from auth context
        const userId = "demo_user"; // Mock user ID

        // Check if user already has premium access
        const existingAccess = await db.select()
          .from(premiumAccess)
          .where(db.sql`${premiumAccess.noteId} = ${noteId} AND ${premiumAccess.userId} = ${userId} AND ${premiumAccess.expiresAt} > datetime('now')`);

        if (existingAccess.length > 0) {
          return {
            content: [{ type: "text", text: "You already have premium access to this note." }],
            isError: true
          };
        }

        // Request payment
        const paymentRequest = await paymentService.requestPremiumAccess(userId, noteId, paymentAmount);

        return {
          content: [{
            type: "text",
            text: `Premium access requested for ${paymentAmount} USD.\n\nPayment URL: ${paymentRequest.paymentUrl}\nPayment ID: ${paymentRequest.paymentId}\n\nComplete the payment to unlock:\n- Detailed analysis methodology\n- Expert reviewer comments\n- Related medical studies\n- Confidence interval data\n- Bias assessment\n\nAccess valid for 24 hours after payment.`
          }],
          paymentUrl: paymentRequest.paymentUrl,
          paymentId: paymentRequest.paymentId
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
