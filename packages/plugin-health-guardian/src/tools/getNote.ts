import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { GetNoteSchema } from "../types";
import { DkgService } from "../services/dkgService";
import { communityNotes, stakes } from "../database";

/**
 * Get Health Community Note MCP Tool
 */
export function registerGetNoteTool(
  mcp: McpServer,
  ctx: DkgContext,
  dkgService: DkgService,
  db: any // TODO: Replace with proper database type
) {
  mcp.registerTool(
    "get-health-note",
    {
      title: "Get Health Community Note",
      description: "Retrieve a published health community note from the DKG",
      inputSchema: GetNoteSchema.shape
    },
    async ({ noteId, ual, claimId }) => {
      try {
        let note: any;
        let dkgData: any = null;

        if (noteId) {
          // First try local DB for quick access, then fall back to DKG discovery
          const notes = await db.select().from(communityNotes).where(eq(communityNotes.noteId, noteId));
          note = notes[0];

          if (note?.ual) {
            // We have a UAL, try to get the actual Knowledge Asset from DKG
            if (!note.ual.startsWith('did:dkg:demo:')) {
              try {
                dkgData = await dkgService.getKnowledgeAsset(note.ual);
              } catch (dkgError) {
                console.warn("DKG retrieval failed, using cached local data:", dkgError instanceof Error ? dkgError.message : String(dkgError));
              }
            }
          } else {
            // No local record, this shouldn't happen in our current flow
            console.warn(`Note ${noteId} found locally but missing UAL`);
          }
        } else if (ual) {
          // Get directly from DKG
          if (!ual.startsWith('did:dkg:demo:')) {
            dkgData = await dkgService.getKnowledgeAsset(ual);
          } else {
            // Mock data for demo UALs
            dkgData = {
              assertion: {
                public: {
                  verdict: "DEMO",
                  confidence: 0.5,
                  description: "Demo data - Real DKG integration not available",
                  sources: ["Demo Source"]
                }
              }
            };
          }
          // Try to find in our database
          const notes = await db.select().from(communityNotes).where(eq(communityNotes.ual, ual));
          note = notes[0];
        } else if (claimId) {
          // Get notes for a claim
          const notes = await db.select().from(communityNotes).where(eq(communityNotes.claimId, claimId));
          note = notes[0];
          if (note?.ual && !note.ual.startsWith('did:dkg:demo:')) {
            try {
              dkgData = await dkgService.getKnowledgeAsset(note.ual);
            } catch (dkgError) {
              console.warn("DKG retrieval failed, data may be unavailable:", dkgError instanceof Error ? dkgError.message : String(dkgError));
            }
          }
        }

        if (!note && !dkgData) {
          return {
            content: [{ type: "text", text: "Note not found." }],
            isError: true
          };
        }

        const content = note || dkgData?.assertion?.public || {};
        const stakesData = noteId ? await db.select().from(stakes).where(eq(stakes.noteId, noteId)) : [];

        return {
          content: [{
            type: "text",
            text: `Community Note Details:\n\nVerdict: ${content.verdict?.toUpperCase() || 'UNKNOWN'}\nConfidence: ${content.confidence ? (content.confidence * 100).toFixed(1) + '%' : 'N/A'}\nSummary: ${content.description || content.summary || 'N/A'}\nSources: ${content.sources ? (Array.isArray(content.sources) ? content.sources.join(", ") : content.sources) : 'N/A'}\nStakes: ${stakesData.length} total\nUAL: ${note?.ual || ual || 'N/A'}`
          }],
          note: content,
          stakes: stakesData
        };
      } catch (error) {
        console.error("Getting note failed:", error);
        return {
          content: [{ type: "text", text: "Failed to retrieve note. Please try again." }],
          isError: true
        };
      }
    }
  );

  // Add a tool to check DKG asset status via web
  mcp.registerTool(
    "check-dkg-web-status",
    {
      title: "Check DKG Asset Web Status",
      description: "Verify if a DKG Knowledge Asset is publicly accessible via web interfaces",
      inputSchema: z.object({
        ual: z.string().describe("The full UAL to check on web interfaces")
      }).shape
    },
    async ({ ual }) => {
      try {
        console.log("🌐 Checking web status for DKG asset:", ual);

        // Parse UAL components
        const ualParts = ual.split('/');
        if (ualParts.length < 4) {
          return {
            content: [{ type: "text", text: "❌ Invalid UAL format. Expected format: did:dkg:blockchain/contract/assetId" }],
            isError: true
          };
        }

        const blockchain = ualParts[1]; // e.g., "otp:20430"
        const contractAddress = ualParts[2]; // e.g., "0xcdb28e93ed340ec10a71bba00a31dbfcf1bd5d37"
        const assetId = ualParts[3]; // e.g., "390830"

        if (!blockchain || !contractAddress || !assetId) {
          return {
            content: [{ type: "text", text: "❌ Invalid UAL format. Missing required components." }],
            isError: true
          };
        }

        let statusReport = `🔍 DKG Asset Web Status Check for: ${ual}\n\n`;
        statusReport += `📊 Parsed UAL Details:\n`;
        statusReport += `- Blockchain: ${blockchain}\n`;
        statusReport += `- Contract: ${contractAddress}\n`;
        statusReport += `- Asset ID: ${assetId}\n\n`;

        // Check if it's OriginTrail Parachain Testnet
        if (blockchain.startsWith('otp:')) {
          statusReport += `🌐 OriginTrail Parachain Testnet Detected\n\n`;
          statusReport += `🔗 Web Explorers to Check:\n`;
          statusReport += `1. **OriginTrail Explorer**: https://origintrail.subscan.io/\n`;
          statusReport += `   - Search for contract: ${contractAddress}\n`;
          statusReport += `   - Look for Knowledge Collection ID: ${assetId}\n\n`;

          statusReport += `2. **Polkadot.js Explorer**: https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Fastrosat-parachain-rpc.origin-trail.network#/explorer\n`;
          statusReport += `   - Connect to OriginTrail Parachain\n`;
          statusReport += `   - Search for extrinsics related to Knowledge Assets\n\n`;

          statusReport += `3. **DKG Node Web Interface**: Check your running DKG node at http://localhost:8900\n`;
          statusReport += `   - Look for published assets in the interface\n\n`;
        }

        // Try direct web API check if available
        try {
          // This is a placeholder - OriginTrail might have public APIs for asset verification
          statusReport += `🔄 Direct API Check:\n`;
          statusReport += `- Attempting to verify asset existence...\n`;

          // For now, we'll just report what we can check
          statusReport += `⚠️  Note: Direct web API verification requires specific OriginTrail endpoints\n`;
          statusReport += `   Use the explorers above to manually verify the asset\n\n`;

        } catch (apiError) {
          statusReport += `❌ API check failed: ${apiError instanceof Error ? apiError.message : String(apiError)}\n\n`;
        }

        // Add troubleshooting steps
        statusReport += `🛠️  Troubleshooting Steps:\n`;
        statusReport += `1. **Check Publishing Status**: Ensure asset was published as 'public'\n`;
        statusReport += `2. **Network Connectivity**: Verify DKG node connectivity\n`;
        statusReport += `3. **Finalization**: Wait for blockchain finalization (may take minutes)\n`;
        statusReport += `4. **Node Replication**: Ensure minimum replication requirements met\n`;
        statusReport += `5. **Manual Verification**: Use the explorer links above\n\n`;

        statusReport += `💡 If asset should be public but isn't visible:\n`;
        statusReport += `- It may still be finalizing on the blockchain\n`;
        statusReport += `- Check that publishing completed without errors\n`;
        statusReport += `- Verify the publishing wallet has sufficient balance\n`;

        return {
          content: [{ type: "text", text: statusReport }],
          ual: ual,
          blockchain: blockchain,
          contractAddress: contractAddress,
          assetId: assetId
        };

      } catch (error) {
        console.error("Web status check failed:", error);
        return {
          content: [{
            type: "text",
            text: `❌ Web status check failed: ${error instanceof Error ? error.message : String(error)}\n\nTry manually checking the OriginTrail explorer at: https://origintrail.subscan.io/`
          }],
          isError: true
        };
      }
    },
  );
}
