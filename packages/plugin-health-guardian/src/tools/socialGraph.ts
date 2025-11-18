import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import { SocialGraphQuerySchema, IDkgService } from "../types";
import { createServiceLogger } from "../services/Logger";

const logger = createServiceLogger("SocialGraphTool");

export function registerSocialGraphTool(
  mcp: McpServer,
  _ctx: DkgContext,
  dkgService: IDkgService
) {
  mcp.registerTool(
    "query-social-graph",
    {
      title: "Query DKG Social Graph",
      description:
        "Runs a DKG social graph SPARQL query (SocialMediaPosting) using keyword filters and optional publisher/paranet scope.",
      inputSchema: SocialGraphQuerySchema.shape,
    },
    async ({ keyword, publisherKey, paranetUAL, limit }) => {
      try {
        const result = await dkgService.querySocialGraph({
          keyword,
          publisherKey,
          paranetUAL,
          limit,
        });

        logger.info("Social graph query completed", {
          keyword,
          publisherKey,
          paranetUAL,
          count: result.count,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        logger.error("Social graph query failed", { error: error.message });
        return {
          content: [{ type: "text", text: `Social graph query failed: ${error.message || error}` }],
          isError: true,
        };
      }
    },
  );
}
