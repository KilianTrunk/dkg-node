import { openAPIRoute, z } from "@dkg/plugin-swagger";
import { eq, desc, sql } from "drizzle-orm";
import type { Router } from "express";
import { ServiceContainer } from "../services";
import { db, agentRewards } from "../database";

/**
 * Rewards API routes
 */
export function registerRewardsRoutes(
  api: Router,
  serviceContainer: ServiceContainer | null
) {
  // Get agent rewards
  api.get(
    "/health/rewards",
    openAPIRoute(
      {
        tag: "Medsy",
        summary: "Get agent rewards",
        description: "Retrieve TRAC token rewards distributed to accurate AI agents",
        query: z.object({
          agentId: z.string().optional(),
          noteId: z.string().optional(),
          limit: z.number({ coerce: true }).optional().default(10),
        }),
        response: {
          description: "List of agent rewards",
          schema: z.object({
            rewards: z.array(z.any()),
            total: z.number(),
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
          let rewards;
          if (req.query.agentId) {
            rewards = await db.select()
              .from(agentRewards)
              .where(eq(agentRewards.agentId, req.query.agentId as string))
              .orderBy(desc(agentRewards.distributedAt))
              .limit((req.query.limit as unknown as number) || 10);
          } else if (req.query.noteId) {
            rewards = await db.select()
              .from(agentRewards)
              .where(eq(agentRewards.noteId, req.query.noteId as string))
              .orderBy(desc(agentRewards.distributedAt));
          } else {
            rewards = await db.select()
              .from(agentRewards)
              .orderBy(desc(agentRewards.distributedAt))
              .limit((req.query.limit as unknown as number) || 10);
          }

          const totalResult = await db.select({ count: sql<number>`count(*)` }).from(agentRewards);
          const total = totalResult[0]?.count || 0;

          res.json({ rewards, total });
        } catch (error: any) {
          res.status(500).json({ error: error.message || "Failed to fetch rewards" });
        }
      },
    ),
  );
}
