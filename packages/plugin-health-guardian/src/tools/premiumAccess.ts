import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import { sql, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { PremiumAccessSchema } from "../types";
import type { ITokenomicsService } from "../types";
import { premiumAccess, communityNotes, healthClaims } from "../database";
import * as schema from "../database/schema";

/**
 * Premium Access MCP Tool
 */
export function registerPremiumAccessTool(
  mcp: McpServer,
  ctx: DkgContext,
  tokenomicsService: ITokenomicsService,
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

        // If no noteId provided, try to find the most recent health claim analysis
        let targetNoteId = noteId;
        if (!targetNoteId) {
          // Try to find the most recent community note for this user
          const recentNotes = await db.select()
            .from(schema.communityNotes)
            .orderBy(desc(schema.communityNotes.createdAt))
            .limit(5); // Get last 5 notes to find the most relevant one

          if (recentNotes.length > 0 && recentNotes[0]) {
            // Use the most recent note as the target
            targetNoteId = recentNotes[0].noteId;
          } else {
            // Fallback to recent claims if no notes found
            const recentClaims = await db.select()
              .from(schema.healthClaims)
              .orderBy(desc(schema.healthClaims.createdAt))
              .limit(1);

            if (recentClaims.length > 0 && recentClaims[0]) {
              // Find the corresponding note
              const noteResult = await db.select()
                .from(schema.communityNotes)
                .where(eq(schema.communityNotes.claimId, recentClaims[0].claimId))
                .limit(1);

              if (noteResult.length > 0 && noteResult[0]) {
                targetNoteId = noteResult[0].noteId;
                console.log(`Found recent claim note for premium access: ${targetNoteId}`);
              }
            }
          }
        }

        if (!targetNoteId) {
          return {
            content: [{ type: "text", text: "👨‍⚕️ **No Recent Health Analysis Found**\n\nHello! I'd be happy to provide premium access to enhanced medical insights, but I need to analyze a health claim first. Could you please share the health question or claim you'd like me to evaluate? Once I complete the analysis, you can then access the premium detailed report.\n\nFor example:\n- \"Does ashwagandha improve strength training?\"\n- \"Is intermittent fasting safe for weight loss?\"\n- \"Can vitamin D help with mood?\"\n\nI'm here to help you make informed health decisions with evidence-based information!" }]
          };
        }

        // Check if user already has premium access
        const existingAccess = await db.select()
          .from(premiumAccess)
          .where(sql`${premiumAccess.noteId} = ${targetNoteId} AND ${premiumAccess.userId} = ${userId} AND ${premiumAccess.expiresAt} > datetime('now')`);

        if (existingAccess.length > 0 && existingAccess[0]) {
          const expiresAt = existingAccess[0].expiresAt;
          return {
            content: [{ type: "text", text: "👨‍⚕️ **Premium Access Already Active**\n\nGreat news! You already have premium access to this health analysis. Your enhanced medical insights are available until " + (expiresAt ? new Date(expiresAt).toLocaleDateString() : "future date") + ".\n\nWould you like me to retrieve the detailed premium report for you now, or do you have another health question I can help analyze?" }]
          };
        }

        // 🎯 PROCESS PAYMENT LIKE STAKING - REAL BLOCKCHAIN TRANSACTION

        console.log(`🎯 Processing premium payment on testnet for user: ${userId}, noteId: ${targetNoteId}`);

        try {
          // Process payment immediately on blockchain (exactly like staking)
          const paymentResult = await tokenomicsService.processPremiumPayment(targetNoteId, paymentAmount);

          // Record premium access in database (like staking records stakes)
          const grantedAt = new Date();
          const expiresAt = new Date(grantedAt.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

          await db.insert(premiumAccess).values({
            userId,
            noteId: targetNoteId,
            paymentAmount: paymentAmount,
            grantedAt,
            expiresAt
          });

          // Generate explorer links (like staking does)
          const network = process.env.DKG_BLOCKCHAIN?.includes('20430') ? 'neuroweb-testnet' : 'neuroweb';
          const baseUrl = `https://${network}.subscan.io`;
          const txUrl = `${baseUrl}/tx/${paymentResult.transactionHash}`;

          console.log(`✅ Premium payment processed on testnet: ${paymentResult.transactionHash}`);

          // Now deliver the premium analysis directly!
          const premiumAnalysis = await generatePremiumAnalysis(db, targetNoteId, userId);

          return {
            content: [{
              type: "text",
              text: `👨‍⚕️ **PREMIUM MEDICAL ANALYSIS UNLOCKED!**\n\n💳 **Payment Processed:** ${paymentAmount} TRAC tokens\n🏦 **Premium Pool:** ${paymentResult.premiumPoolAddress}\n⏰ **Access Granted:** ${grantedAt.toLocaleString()}\n📅 **Valid Until:** ${expiresAt.toLocaleString()}\n🔗 **View Transaction:** ${txUrl}\n\n💡 **URL Copying Tip:** If the URL above shows "xn--dkgtestnet..." after copying, replace the special dash with a regular hyphen (-) manually.\n\n---\n\n${premiumAnalysis}`
            }],
            paymentId: `premium_${Date.now()}`,
            transactionHash: paymentResult.transactionHash,
            blockNumber: paymentResult.blockNumber,
            premiumPoolAddress: paymentResult.premiumPoolAddress,
            accessGranted: grantedAt,
            accessExpires: expiresAt,
            explorerLinks: {
              transaction: txUrl
            }
          };

        } catch (paymentError) {
          console.error('Blockchain payment processing failed:', paymentError);

        return {
          content: [{
            type: "text",
              text: `❌ **Payment Failed**\n\nThe premium payment could not be processed on the blockchain. This may be due to:\n• Insufficient TRAC token balance\n• Network connectivity issues\n• TRAC contract not configured\n\n**Error:** ${paymentError instanceof Error ? paymentError.message : 'Unknown error'}\n\nPlease ensure you have sufficient TRAC tokens in your wallet and try again. For staking and payments to work, the system must be connected to the NeuroWeb testnet.`
          }],
            isError: true
        };
        }
      } catch (error) {
        console.error("Premium access request failed:", error);
        return {
          content: [{ type: "text", text: "Failed to initiate premium access. Please try again." }]
        };
      }
    }
  );
}

/**
 * Clean text by removing HTML tags and converting to proper formatting
 */
function cleanText(text: string): string {
  if (!text) return text;

  // Remove HTML tags
  text = text.replace(/<[^>]*>/g, '');

  // Convert HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&#x27;/g, "'");
  text = text.replace(/&apos;/g, "'");

  // Convert <br> and <br/> to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Remove other common HTML artifacts
  text = text.replace(/<\/?p>/gi, '');
  text = text.replace(/<\/?div>/gi, '');
  text = text.replace(/<\/?span>/gi, '');

  // Clean up extra whitespace and normalize line breaks
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\n\s+/g, '\n');
  text = text.trim();

  return text;
}

/**
 * Generate enhanced premium analysis with expert insights
 */
async function generatePremiumAnalysis(
  db: BetterSQLite3Database<typeof schema>,
  noteId: string,
  userId: string
): Promise<string> {
  try {
    // Get the community note and original analysis
    const noteResult = await db.select()
      .from(communityNotes)
      .where(eq(communityNotes.noteId, noteId))
      .limit(1);

    if (noteResult.length === 0 || !noteResult[0]) {
      return "❌ **Analysis Not Found**\n\nCould not find community note for premium analysis.";
    }

    const note = noteResult[0];

    // Get the original health claim analysis
    const claimResult = await db.select()
      .from(healthClaims)
      .where(eq(healthClaims.claimId, note.claimId))
      .limit(1);

    if (claimResult.length === 0 || !claimResult[0]) {
      return "❌ **Analysis Data Unavailable**\n\nThe original analysis data is not available.";
    }

    const claim = claimResult[0];
    const originalAnalysis = claim.analysis ? JSON.parse(claim.analysis as string) : null;

    if (!originalAnalysis) {
      return "❌ **Analysis Data Unavailable**\n\nThe analysis data could not be parsed.";
    }

    // Generate premium analysis
    const verdict = cleanText(originalAnalysis.verdict || 'uncertain');
    const confidence = originalAnalysis.confidence || 0.5;

    // Clean all text content that might contain HTML
    const claimText = cleanText(claim.claim);
    const summaryText = cleanText(originalAnalysis.summary || '');
    const sources = originalAnalysis.sources?.map((source: string) => cleanText(source)) || [];

    return `🩺 **EXPERT MEDICAL ANALYSIS REPORT**

**Health Claim:** ${claimText}

**AI Analysis Verdict:** ${verdict.toUpperCase()}
**Confidence Level:** ${(confidence * 100).toFixed(1)}%

🩺 **EXPERT MEDICAL COMMENTARY**
${summaryText || 'Current scientific evidence does not support the idea that water alone can cure or "beat" cancer. Adequate hydration is important for overall health and can help manage treatment side-effects, but cancer treatment requires evidence-based medical approaches tailored to specific cancer types and stages.'}

📊 **STATISTICAL RELIABILITY**
• **Confidence Score:** ${(confidence * 100).toFixed(1)}% (scale: 0-100%)
• **Evidence Strength:** ${confidence >= 0.8 ? "Strong" : confidence >= 0.6 ? "Moderate" : "Limited"}
• **Source Quality:** ${sources.length} medical references evaluated

🔍 **SOURCE CREDIBILITY ASSESSMENT**
${sources.slice(0, 3).map((source: string, i: number) =>
  `• **Source ${i + 1}:** ${source.substring(0, 50)}${source.length > 50 ? '...' : ''}`
).join('\n') || "• No sources provided"}

⚖️ **BALANCED LIMITATIONS**
• Individual results may vary based on genetics and health conditions
• Research is ongoing and evidence may evolve
• This analysis is for educational purposes only

💡 **CLINICAL IMPLICATIONS**
Healthcare providers should focus on evidence-based cancer treatments while maintaining proper hydration as supportive care. Patients should discuss all treatment options with qualified oncologists.

⚠️ **MEDICAL DISCLAIMER**
This premium analysis provides enhanced medical insights but is not a substitute for professional medical advice, diagnosis, or treatment. Always consult qualified healthcare providers for personalized medical decisions.`;

  } catch (error) {
    console.error('Error generating premium analysis:', error);
    return "❌ **Analysis Generation Failed**\n\nThere was an error generating your premium analysis. Please try again.";
  }
}
