import consumers from "stream/consumers";
import { defineDkgPlugin } from "@dkg/plugins";
import { z } from "@dkg/plugins/helpers";
import {
  CompleteResourceTemplateCallback,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
// @ts-expect-error dkg.js
import { BLOCKCHAIN_IDS } from "dkg.js/constants";
import { getExplorerUrl } from "../utils";

export default defineDkgPlugin((ctx, mcp) => {
  async function publishJsonLdAsset(
    jsonldRaw: string,
    privacy: "private" | "public",
  ): Promise<{ ual: string | null; error: string | null }> {
    try {
      const jsonldParsed = JSON.parse(jsonldRaw);
      const wrapped = { [privacy]: jsonldParsed };
      const createAsset = await ctx.dkg.asset.create(wrapped, {
        epochsNum: 2,
        minimumNumberOfFinalizationConfirmations: 3,
        minimumNumberOfNodeReplications: 1,
      });
      const ual = createAsset?.UAL || null;
      return { ual, error: null };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { ual: null, error };
    }
  }

  mcp.registerTool(
    "dkg-get",
    {
      title: "DKG Knowledge Asset get tool",
      description:
        "A tool for running a GET operation on OriginTrail Decentralized Knowledge Graph (DKG) and retrieving a specific Knowledge Asset by its UAL (Unique Asset Locator), taking the UAL as input.",
      inputSchema: { ual: z.string() },
    },
    async ({ ual }) => {
      const getAssetResult = await ctx.dkg.asset.get(ual);
      return {
        content: [
          { type: "text", text: JSON.stringify(getAssetResult, null, 2) },
        ],
      };
    },
  );

  const ualCompleteOptions: Record<string, CompleteResourceTemplateCallback> = {
    blockchainName: (val) =>
      (Object.values(BLOCKCHAIN_IDS) as string[]).reduce<string[]>(
        (acc, id) => {
          const blockchainName = id.split(":")[0]!;
          if (
            blockchainName.includes(val.toLowerCase()) &&
            !acc.includes(blockchainName)
          )
            acc.push(blockchainName);

          return acc;
        },
        [],
      ),
    blockchainId: (val, ctx) =>
      (Object.values(BLOCKCHAIN_IDS) as string[]).reduce<string[]>(
        (acc, id) => {
          const [blockchainName, blockchainId] = id.split(":");
          if (
            blockchainName === ctx?.arguments?.blockchainName &&
            blockchainId!.includes(val)
          )
            acc.push(blockchainId!);

          return acc;
        },
        [],
      ),
    // TODO: List possible blockchain contract addresses for v8 and v6
    // blockchainAddress: (val, ctx) =>...
  };

  mcp.registerResource(
    "dkg-knowledge-asset",
    new ResourceTemplate(
      "did:dkg:{blockchainName}:{blockchainId}/{blockchainAddress}/{collectionId}/{assetId}",
      {
        list: undefined,
        complete: ualCompleteOptions,
      },
    ),
    {
      title: "DKG Knowledge Asset",
      description:
        "A resource for accessing Knowledge Assets on OriginTrail Decentralized Knowledge Graph (DKG).",
    },
    async (ual) => {
      const getAssetResult = await ctx.dkg.asset.get(ual.href.toLowerCase(), {
        includeMetadata: true,
      });
      return {
        contents: [
          { uri: ual.href, text: JSON.stringify(getAssetResult, null, 2) },
        ],
      };
    },
  );

  mcp.registerResource(
    "dkg-knowledge-collection",
    new ResourceTemplate(
      "did:dkg:{blockchainName}:{blockchainId}/{blockchainAddress}/{collectionId}",
      {
        list: undefined,
        complete: ualCompleteOptions,
      },
    ),
    {
      title: "DKG Knowledge Collection",
      description:
        "A resource for accessing Knowledge Collections on OriginTrail Decentralized Knowledge Graph (DKG).",
    },
    async (ual) => {
      const getAssetResult = await ctx.dkg.asset.get(ual.href.toLowerCase(), {
        includeMetadata: true,
      });
      return {
        contents: [
          { uri: ual.href, text: JSON.stringify(getAssetResult, null, 2) },
        ],
      };
    },
  );

  mcp.registerTool(
    "dkg-create",
    {
      title: "DKG Knowledge Asset create tool",
      description:
        "A tool for creating and publishing Knowledge Assets on OriginTrail Decentralized Knowledge Graph (DKG), " +
        "taking either a single JSON-LD string or a single file id as input. " +
        "Optionally, you can specify privacy as 'private' or 'public' (default: 'private').",
      inputSchema: {
        jsonld: z
          .string()
          .describe("JSON-LD content or ID of an uploaded file"),
        privacy: z.enum(["private", "public"]).optional().default("private"),
      },
    },
    async (input) => {
      if (!input.jsonld) {
        console.error("No JSON-LD content provided after file read.");
        throw new Error("No JSON-LD content provided.");
      }
      const privacy = input.privacy || "private";
      const content =
        input.jsonld.startsWith("{") || input.jsonld.startsWith("[")
          ? input.jsonld
          : await ctx.blob.get(input.jsonld).then((r) => {
              if (!r) {
                console.error(`File with id "${input.jsonld}" not found`);
                throw new Error(`File with id "${input.jsonld}" not found`);
              }
              return consumers.text(r.data);
            });

      const { ual, error } = await publishJsonLdAsset(content, privacy);
      if (error) {
        console.error("Error creating asset:", error);
        throw new Error("Failed to create asset: " + error);
      }

      const explorerLink = getExplorerUrl(ual!);
      const response = `Knowledge Asset collection successfully created.\n\nUAL: ${ual}\nDKG Explorer link: ${explorerLink}`;
      console.log("Formatted response:", response);
      return {
        content: [{ type: "text", text: response }],
      };
    },
  );

  mcp.registerTool(
    "query-knowledge-graph",
    {
      title: "Query the DKG with SPARQL",
      description:
        "Run a SPARQL query against the OriginTrail DKG using the connected node's SDK. Use SELECT queries for best results.",
      inputSchema: {
        query: z
          .string()
          .describe("SPARQL query string to execute against the DKG"),
        operation: z
          .enum(["SELECT", "CONSTRUCT", "ASK", "DESCRIBE"])
          .optional()
          .default("SELECT"),
      },
    },
    async ({ query }) => {
      if (!query?.trim()) throw new Error("Query string is required");

      try {
        let finalQuery = query.trim();
        const defaultQuery = `
PREFIX schema: <https://schema.org/>
SELECT ?post ?headline ?url ?datePublished WHERE {
  ?post a schema:SocialMediaPosting ;
        schema:headline ?headline ;
        schema:url ?url ;
        schema:datePublished ?datePublished .
}
ORDER BY DESC(?datePublished)
LIMIT 20`.trim();

        // Provide a default schema.org prefix when missing to avoid common SPARQL errors
        if (!/prefix\s+schema:/i.test(finalQuery)) {
          finalQuery = `PREFIX schema: <https://schema.org/>\n${finalQuery}`;
        }

        // Replace unknown Guardian Social Graph prefix "gs:" with schema.org when no gs prefix is defined
        if (/gs:/i.test(finalQuery) && !/prefix\s+gs:/i.test(finalQuery)) {
          finalQuery = finalQuery.replace(/\bgs:/g, "schema:");
        }

        // If query uses default ":" prefix without declaration, rewrite to schema:
        if (/[^a-zA-Z0-9_]:(?:[A-Za-z][A-Za-z0-9_-]*)/.test(finalQuery) && !/prefix\s+:\s*</i.test(finalQuery)) {
          finalQuery = finalQuery.replace(/(^|[\s{;])\:([A-Za-z][\w-]*)/g, (_m, prefix, local) => `${prefix}schema:${local}`);
        }

        // Fallback to a known-good query if the incoming query looks like a SocialPost/guardian template without prefixes
        if (/(SocialPost|SocialMediaPosting)/i.test(query) && !/prefix\s+gs:/i.test(query)) {
          finalQuery = defaultQuery;
        }

        const endpoint =
          process.env.DKG_SPARQL_ENDPOINT ||
          "https://euphoria.origin-trail.network/dkg-sparql-query";

        const runQuery = async (q: string) => {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ query: q }),
          });

          if (!response.ok) {
            const body = await response.text();
            throw new Error(
              `SPARQL request failed (${response.status}): ${body || "No body"}`,
            );
          }

          return response.json();
        };
        const result = await runQuery(finalQuery);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("DKG query failed:", message);
        return {
          content: [
            {
              type: "text",
              text: `DKG query failed: ${message}`,
            },
          ],
        };
      }
    },
  );
});
