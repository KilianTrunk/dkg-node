import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { CompletePaymentSchema } from "../types";
import type { IPaymentService } from "../types";
import { premiumAccess } from "../database";
import * as schema from "../database/schema";

/**
 * Complete Payment MCP Tool
 * Simulates payment completion and grants premium access for testing
 */
export function registerCompletePaymentTool(
  mcp: McpServer,
  ctx: DkgContext,
  paymentService: IPaymentService,
  db: BetterSQLite3Database<typeof schema>
) {
  mcp.registerTool(
    "complete-premium-payment",
    {
      title: "Complete Premium Payment",
      description: "Complete a premium access payment and grant access to enhanced analysis",
      inputSchema: CompletePaymentSchema.shape
    },
    async ({ paymentId, transactionHash }) => {
      try {
        const userId = "demo_user"; // Mock user ID

        // Simulate payment completion
        // In production, this would verify the actual blockchain transaction
        console.log(`Simulating payment completion for paymentId: ${paymentId}`);

        // Get payment details from database
        const paymentRecord = await db.select().from(schema.x402Payments).where(
          eq(schema.x402Payments.paymentId, paymentId)
        ).limit(1);

        if (paymentRecord.length === 0 || !paymentRecord[0]) {
          return {
            content: [{
              type: "text",
              text: `❌ **Payment Not Found**\n\nCould not find payment with ID \`${paymentId}\`. Please check the payment reference and try again.`
            }]
          };
        }

        const payment = paymentRecord[0];

        // Update payment status to completed
        await db.update(schema.x402Payments)
          .set({
            status: "payment_completed",
            transactionHash: transactionHash || `simulated_tx_${Date.now()}`,
            payerAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", // Demo address
            updatedAt: new Date()
          })
          .where(eq(schema.x402Payments.paymentId, paymentId));

        // Extract noteId from payment description - handle different formats
        let noteId = "unknown";
        if (payment.description) {
          // Try multiple regex patterns to find note ID
          const patterns = [
            /note ([a-zA-Z0-9_]+)/,  // note note_1234567890_abc123def4
            /for note ([a-zA-Z0-9_]+)/,  // for note note_1234567890_abc123def4
            /note: ([a-zA-Z0-9_]+)/,  // note: note_1234567890_abc123def4
            /noteId: ([a-zA-Z0-9_]+)/,  // noteId: note_1234567890_abc123def4
          ];

          for (const pattern of patterns) {
            const match = payment.description.match(pattern);
            if (match && match[1]) {
              noteId = match[1];
              break;
            }
          }
        }

        console.log(`Completing payment for user: ${userId}, noteId: ${noteId}, description: ${payment.description}`);

        // Grant premium access
        const grantedAt = new Date();
        const expiresAt = new Date(grantedAt.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await db.insert(premiumAccess).values({
          userId,
          noteId,
          paymentAmount: parseFloat(payment.amount),
          grantedAt,
          expiresAt
        });

        console.log(`Premium access granted for user: ${userId}, noteId: ${noteId}, expires: ${expiresAt.toISOString()}`);

        return {
          content: [{
            type: "text",
            text: `✅ **Payment Completed Successfully!**\n\nPayment \`${paymentId}\` has been processed and premium access has been granted.\n\n**Transaction:** ${transactionHash || `simulated_tx_${Date.now()}`}\n**Access Granted:** ${grantedAt.toLocaleString()}\n**Access Expires:** ${expiresAt.toLocaleString()}\n\nYou can now use the "get-premium-health-analysis" tool to retrieve your enhanced medical report. Your premium access is valid for 30 days.`
          }]
        };

      } catch (error) {
        console.error("Payment completion failed:", error);
        return {
          content: [{
            type: "text",
            text: "Failed to complete payment. Please try again or contact support if the issue persists."
          }]
        };
      }
    }
  );
}
