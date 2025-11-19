import { openAPIRoute, z } from "@dkg/plugin-swagger";
import { eq, desc } from "drizzle-orm";
import type { Router } from "express";
import { ServiceContainer } from "../services";
import { db, communityNotes } from "../database";

/**
 * Notes API routes
 */
export function registerNotesRoutes(
  api: Router,
  serviceContainer: ServiceContainer | null
) {
  // Get community notes
  api.get(
    "/health/notes",
    openAPIRoute(
      {
        tag: "Medsy",
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
        if (!serviceContainer) {
          return res
            .status(503)
            .json({ error: "Medsy Plugin is starting up" });
        }

        try {
          let notes;
          if (req.query.claimId) {
            notes = await db.select()
              .from(communityNotes)
              .where(eq(communityNotes.claimId, req.query.claimId as string))
              .orderBy(desc(communityNotes.createdAt))
              .limit((req.query.limit as unknown as number) || 10);
          } else {
            notes = await db.select()
              .from(communityNotes)
              .orderBy(desc(communityNotes.createdAt))
              .limit((req.query.limit as unknown as number) || 10);
          }

          res.json({ notes });
        } catch (error: any) {
          res.status(500).json({ error: error.message || "Failed to fetch notes" });
        }
      },
    ),
  );
}
