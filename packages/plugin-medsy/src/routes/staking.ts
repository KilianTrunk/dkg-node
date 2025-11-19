import { openAPIRoute, z } from "@dkg/plugin-swagger";
import { eq } from "drizzle-orm";
import type { Router } from "express";
import { ServiceContainer } from "../services";
import { db, stakes } from "../database";

/**
 * Staking API routes
 */
export function registerStakingRoutes(
  api: Router,
  serviceContainer: ServiceContainer | null
) {
  // Get staking information
  api.get(
    "/health/stakes/:noteId",
    openAPIRoute(
      {
        tag: "Medsy",
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
        if (!serviceContainer) {
          return res
            .status(503)
            .json({ error: "Medsy Plugin is starting up" });
        }

        try {
          const stakeData = await db.select().from(stakes).where(eq(stakes.noteId, req.params.noteId!));

          const support = stakeData.filter((s: any) => s.position === "support").reduce((sum: number, s: any) => sum + s.amount, 0);
          const oppose = stakeData.filter((s: any) => s.position === "oppose").reduce((sum: number, s: any) => sum + s.amount, 0);

          res.json({
            stakes: stakeData,
            consensus: { support, oppose }
          });
        } catch (error: any) {
          res.status(500).json({ error: error.message || "Failed to fetch stakes" });
        }
      },
    ),
  );
}
