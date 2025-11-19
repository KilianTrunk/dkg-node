import { openAPIRoute, z } from "@dkg/plugin-swagger";
import { eq, desc, sql } from "drizzle-orm";
import type { Router } from "express";
import { ServiceContainer } from "../services";
import { db, healthClaims } from "../database";

/**
 * Claims API routes
 */
export function registerClaimsRoutes(
  api: Router,
  serviceContainer: ServiceContainer | null
) {
  // Get health claims
  api.get(
    "/health/claims",
    openAPIRoute(
      {
        tag: "Medsy",
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
        if (!serviceContainer) {
          return res
            .status(503)
            .json({ error: "Medsy Plugin is starting up" });
        }

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
        } catch (error: any) {
          res.status(500).json({ error: error.message || "Failed to fetch claims" });
        }
      },
    ),
  );
}
