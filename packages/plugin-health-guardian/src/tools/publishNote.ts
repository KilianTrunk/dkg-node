import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import { eq } from "drizzle-orm";
import { PublishNoteSchema } from "../types";
import { DkgService } from "../services/dkgService";
import { communityNotes, healthClaims } from "../database";

/**
 * Publish Health Community Note MCP Tool
 */
export function registerPublishNoteTool(
  mcp: McpServer,
  ctx: DkgContext,
  dkgService: DkgService,
  db: any // TODO: Replace with proper database type
) {
  mcp.registerTool(
    "publish-health-note",
    {
      title: "Publish Health Community Note",
      description: "Publish a verified health claim analysis as a Community Note on the DKG",
      inputSchema: PublishNoteSchema.shape
    },
    async ({ claimId, summary, confidence, verdict, sources }) => {
      try {
        // Generate noteId first
        const noteId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create JSON-LD for DKG Knowledge Asset (unwrapped)
        const noteContent = {
          "@context": "https://schema.org/",
          "@type": "MedicalWebPage",
          "@id": `urn:health-note:${claimId}`,
          "name": "Health Claim Community Note",
          "description": summary,
          "verdict": verdict,
          "confidence": confidence,
          "sources": sources,
          "datePublished": new Date().toISOString(),
          "publisher": {
            "@type": "Organization",
            "name": "Health Guardian AI"
          }
        };

        // Publish to DKG using real Edge Node
        const result = await dkgService.publishKnowledgeAsset(noteContent, "public");

        // Store minimal metadata locally for relationships and quick access
        // The actual Knowledge Asset lives on DKG and is discoverable network-wide
        await db.insert(communityNotes).values({
          noteId,
          claimId,
          ual: result.UAL,
          summary,
          confidence,
          verdict,
          sources: JSON.stringify(sources),
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Update claim status to track analysis completion
        await db.update(healthClaims)
          .set({ status: "published", updatedAt: new Date() })
          .where(eq(healthClaims.claimId, claimId));

        return {
          content: [{
            type: "text",
            text: `Community Note published successfully!\n\nUAL: ${result.UAL}\nNote ID: ${noteId}\nVerdict: ${verdict.toUpperCase()}\nConfidence: ${(confidence * 100).toFixed(1)}%`
          }],
          noteId,
          ual: result.UAL
        };
      } catch (error) {
        console.error("Publishing note failed:", error);
        return {
          content: [{ type: "text", text: "Failed to publish note. Please try again." }],
          isError: true
        };
      }
    }
  );
}
