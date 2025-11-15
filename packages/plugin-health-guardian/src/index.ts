import { defineDkgPlugin } from "@dkg/plugins";
import { openAPIRoute, z } from "@dkg/plugin-swagger";
import { eq, desc, sql } from "drizzle-orm";
import { db, healthClaims, communityNotes, stakes, premiumAccess } from "./database";

// Import services
import { AIAnalysisService } from "./services/aiAnalysis";
import { DkgService } from "./services/dkgService";
import { TokenomicsService } from "./services/tokenomicsService";
import { PaymentService } from "./services/paymentService";

// Import tools
import { registerAnalyzeClaimTool } from "./tools/analyzeClaim";
import { registerPublishNoteTool } from "./tools/publishNote";
import { registerGetNoteTool } from "./tools/getNote";
import { registerStakeTokensTool } from "./tools/stakeTokens";
import { registerPremiumAccessTool } from "./tools/premiumAccess";

// Helper function to safely parse sources JSON
function parseSources(sourcesJson: string | null): string[] {
  if (!sourcesJson) return [];
  try {
    const parsed = JSON.parse(sourcesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default defineDkgPlugin((ctx, mcp, api) => {
  // Initialize services
  const aiService = new AIAnalysisService();
  const dkgService = new DkgService();
  const tokenomicsService = new TokenomicsService();
  const paymentService = new PaymentService();

  // Initialize all services - pass context to DKG service for real integration
  Promise.all([
    aiService.initializeAIClient(),
    dkgService.initialize(ctx),
    tokenomicsService.initialize(),
    paymentService.initialize()
  ]).catch(error => {
    console.error("Failed to initialize services:", error);
  });

  // Register MCP tools using modular functions
  registerAnalyzeClaimTool(mcp, ctx, aiService, db);
  registerPublishNoteTool(mcp, ctx, dkgService, db);
  registerGetNoteTool(mcp, ctx, dkgService, db);
  registerStakeTokensTool(mcp, ctx, tokenomicsService, db);
  registerPremiumAccessTool(mcp, ctx, paymentService, db);

  // API Routes for web interface integration

  // Get health claims
  api.get(
    "/health/claims",
    openAPIRoute(
      {
        tag: "Health Guardian",
        summary: "Get health claims",
        description: "Retrieve analyzed health claims",
        query: z.object({
          limit: z.number({ coerce: true }).optional().default(10),
          offset: z.number({ coerce: true }).optional().default(0),
        }),
        response: {
          description: "List of health claims",
          schema: z.object({
            claims: z.array(z.any()),
            total: z.number(),
          }),
        },
      },
      async (req, res) => {
        try {
          const { limit = 10, offset = 0 } = req.query;
          const claims = await db.select()
            .from(healthClaims)
            .orderBy(desc(healthClaims.createdAt))
            .limit(limit as number)
            .offset(offset as number);

          const totalResult = await db.select({ count: sql<number>`count(*)` }).from(healthClaims);
          const total = totalResult[0]?.count || 0;

          res.json({ claims, total });
        } catch (error) {
          res.status(500).json({ error: "Failed to fetch claims" });
        }
      },
    ),
  );

  // Get community notes
  api.get(
    "/health/notes",
    openAPIRoute(
      {
        tag: "Health Guardian",
        summary: "Get community notes",
        description: "Retrieve published health community notes",
        query: z.object({
          claimId: z.string().optional(),
          limit: z.number({ coerce: true }).optional().default(10),
        }),
        response: {
          description: "List of community notes",
          schema: z.object({
            notes: z.array(z.any()),
          }),
        },
      },
      async (req, res) => {
        try {
          let notes;
          if (req.query.claimId) {
            notes = await db.select()
              .from(communityNotes)
              .where(eq(communityNotes.claimId, req.query.claimId as string))
              .orderBy(desc(communityNotes.createdAt))
              .limit(req.query.limit as number || 10);
          } else {
            notes = await db.select()
              .from(communityNotes)
              .orderBy(desc(communityNotes.createdAt))
              .limit(req.query.limit as number || 10);
          }

          res.json({ notes });
        } catch (error) {
          res.status(500).json({ error: "Failed to fetch notes" });
        }
      },
    ),
  );

  // Get staking information
  api.get(
    "/health/stakes/:noteId",
    openAPIRoute(
      {
        tag: "Health Guardian",
        summary: "Get stakes for a note",
        description: "Retrieve staking information for a community note",
        params: z.object({
          noteId: z.string(),
        }),
        response: {
          description: "Staking information",
          schema: z.object({
            stakes: z.array(z.any()),
            consensus: z.object({
              support: z.number(),
              oppose: z.number(),
            }),
          }),
        },
      },
      async (req, res) => {
        try {
          const stakeData = await db.select().from(stakes).where(eq(stakes.noteId, req.params.noteId));

          const support = stakeData.filter((s: any) => s.position === "support").reduce((sum: number, s: any) => sum + s.amount, 0);
          const oppose = stakeData.filter((s: any) => s.position === "oppose").reduce((sum: number, s: any) => sum + s.amount, 0);

          res.json({
            stakes: stakeData,
            consensus: { support, oppose }
          });
        } catch (error) {
          res.status(500).json({ error: "Failed to fetch stakes" });
        }
      },
    ),
  );
});
