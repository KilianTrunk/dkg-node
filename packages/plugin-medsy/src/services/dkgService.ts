import DKG from "dkg.js";
import { DKG_CONFIG } from "../config";
import type { DkgPublishResult, DkgAsset, IDkgService } from "../types";
import { dkgLogger } from "./Logger";

/**
 * DKG Edge Node Service - Real DKG integration
 */
export class DkgService implements IDkgService {
  private dkgClient: any = null;

  /**
   * Initialize with MCP context (when running as plugin)
   */
  async initialize(ctx?: any) {
    if (ctx?.dkg) {
      this.dkgClient = ctx.dkg;
      dkgLogger.info("DKG Service initialized with DKG client from context");
      return;
    }

    await this.initializeStandalone();
  }

  async initializeStandalone() {
    const endpoint = process.env.MEDSY_DKG_ENDPOINT || process.env.DKG_ENDPOINT || "http://localhost:8900";
    const blockchain = process.env.MEDSY_DKG_BLOCKCHAIN || process.env.DKG_BLOCKCHAIN || "otp:20430";
    const privateKey = process.env.DKG_PUBLISH_WALLET;

    if (!privateKey) {
      throw new Error("DKG_PUBLISH_WALLET environment variable required for standalone DKG client");
    }

    try {
      const endpointUrl = new URL(endpoint);
      const defaultPort = endpointUrl.protocol === "https:" ? "443" : "8900";
      const port = endpointUrl.port || defaultPort;

      dkgLogger.info("Initializing standalone DKG client", {
        endpoint,
        blockchain,
        port
      });

      this.dkgClient = new DKG({
        endpoint: `${endpointUrl.protocol}//${endpointUrl.hostname}`,
        port,
        blockchain: {
          name: blockchain,
          privateKey: privateKey,
        },
        maxNumberOfRetries: 100,
        frequency: 2,
        contentType: "all",
      });

      dkgLogger.info("DKG Service initialized with standalone client");
    } catch (error) {
      dkgLogger.error("Failed to initialize standalone DKG client", { error });
      throw new Error(`Failed to initialize DKG client: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Publish a Knowledge Asset to the DKG
   */
  async publishKnowledgeAsset(content: any, privacy: "private" | "public" = "private", relatedUals?: string[]): Promise<DkgPublishResult> {
    if (!this.dkgClient) {
      throw new Error("DKG client not initialized");
    }

    dkgLogger.info("Publishing Knowledge Asset to DKG", {
      contentPreview: JSON.stringify(content).substring(0, 200) + "...",
      privacy
    });

    const timestamp = new Date().toISOString();

    const topSources = content.sources
      ?.filter((source: string, index: number, arr: string[]) =>
        source && arr.indexOf(source) === index
      )
      .slice(0, 3) || [];

    const citationList = topSources
      .map((source: string) => source.match(/https?:\/\/[^\s]+/)?.[0])
      .filter((url: string | undefined): url is string => !!url && url.length > 0);

    const jsonLdContent: any = {
      "@context": "https://schema.org/",
      "@type": "ClaimReview",
      "@id": `urn:medsy:claim-review:${content.claimId}`,

      "name": `Health Claim: ${content.claim.substring(0, 50)}${content.claim.length > 50 ? '...' : ''}`,
      "description": content.summary || "Evidence-based health claim analysis",
      "claimReviewed": content.claim,
      "reviewBody": content.summary,
      "datePublished": timestamp,

      "author": content.agentName || "Medsy Health Analyzer",

      "reviewRating": {
        "@type": "Rating",
        "ratingValue": content.confidence || 0.5,
        "bestRating": 1.0,
        "ratingExplanation": `${content.verdict || "uncertain"} (${Math.round((content.confidence || 0.5) * 100)}% confidence)`
      },

      "identifier": content.claimId,
      "inLanguage": "en",
      "genre": "Health Fact-Check"
    };

    if (citationList.length > 0) {
      jsonLdContent.citation = citationList;
    }

    if (relatedUals && relatedUals.length > 0) {
      const uniqueUals = Array.from(new Set(relatedUals)).slice(0, 3);
      jsonLdContent.relatedLink = uniqueUals;
    }

    const wrappedContent = { [privacy]: jsonLdContent };

    try {
      const result = await this.dkgClient.asset.create(wrappedContent, {
        epochsNum: DKG_CONFIG.publishing.epochsNum,
        minimumNumberOfFinalizationConfirmations: DKG_CONFIG.publishing.minimumNumberOfFinalizationConfirmations,
        minimumNumberOfNodeReplications: DKG_CONFIG.publishing.minimumNumberOfNodeReplications,
      });

      if (result?.operation?.publish?.errorType || result?.operation?.publish?.errorMessage) {
        const errorType = result.operation.publish.errorType;
        const errorMessage = result.operation.publish.errorMessage;
        throw new Error(`DKG API Error: ${errorType} - ${errorMessage}`);
      }

      if (!result.UAL) {
        throw new Error("DKG API returned success but no UAL was provided");
      }

      dkgLogger.info("Knowledge Asset published successfully", { ual: result.UAL });

      return {
        UAL: result.UAL,
        transactionHash: result.operation?.mintKnowledgeCollection?.transactionHash,
        blockNumber: result.blockNumber
      };
    } catch (error) {
      dkgLogger.error("DKG publishing failed", { error });
      throw new Error(`DKG publishing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Retrieve a Knowledge Asset from the DKG
   */
  async getKnowledgeAsset(ual: string): Promise<DkgAsset | null> {
    if (!this.dkgClient) {
      throw new Error("DKG client not initialized");
    }

    if (ual.startsWith('did:dkg:demo:')) {
      dkgLogger.warn("Skipping mock UAL retrieval", { ual });
      return null;
    }

    dkgLogger.info("Retrieving Knowledge Asset from DKG", { ual });

    try {
      const result = await this.dkgClient.asset.get(ual, {
        includeMetadata: true
      });

      dkgLogger.info("Knowledge Asset retrieved successfully");

      return {
        UAL: ual,
        content: result.assertion || result,
        metadata: result.metadata,
        timestamp: result.metadata?.timestamp
      };
    } catch (error) {
      dkgLogger.error("DKG retrieval failed", { error });
      return null;
    }
  }

  /**
   * Query DKG for health-related Knowledge Assets using SPARQL
   * This replaces local DB queries for discovery
   */
  async queryHealthAssets(sparqlQuery: string): Promise<any> {
    if (!this.dkgClient) {
      throw new Error("DKG client not initialized");
    }

    dkgLogger.info("Querying DKG for health assets", { queryPreview: sparqlQuery.substring(0, 100) + "..." });

    try {
      const result = await this.dkgClient.graph?.query?.(sparqlQuery, "SELECT");
      return result;
    } catch (error) {
      dkgLogger.error("DKG query failed", { error });
      return null;
    }
  }

  /**
   * Execute SPARQL query on DKG
   */
  async executeSparqlQuery(query: string): Promise<any> {
    return this.queryHealthAssets(query);
  }

  /**
   * Find related knowledge assets by searching for similar content
   * Returns UALs of existing assets that might be related to the claim
   */
  async findRelatedUals(claim: string, limit: number = 5): Promise<string[]> {
    if (!this.dkgClient) {
      return [];
    }

    try {
      const claimLower = claim.toLowerCase();
      const keywords = claimLower
        .split(/\s+/)
        .filter(word => word.length > 3 && !['that', 'this', 'with', 'from', 'have', 'been', 'does', 'make', 'makes'].includes(word))
        .slice(0, 3);

      if (keywords.length === 0) {
        keywords.push(claimLower.substring(0, 20));
      }

      const keywordFilter = keywords.length > 0
        ? keywords.map(keyword => `CONTAINS(LCASE(STR(?content)), "${keyword.replace(/"/g, '\\"')}")`).join(' || ')
        : `CONTAINS(LCASE(STR(?content)), "${claimLower.substring(0, 30).replace(/"/g, '\\"')}")`;

      const query = `
        SELECT DISTINCT ?ual
        WHERE {
          GRAPH ?ual {
            ?id ?p ?content
            FILTER(${keywordFilter})
          }
        }
        LIMIT ${limit}
      `;

      const result = await this.dkgClient.graph?.query?.(query, "SELECT");
      const data = result?.data || (Array.isArray(result) ? result : []);

      const uals = data
        .map(row => row.ual || row["?ual"]?.value)
        .filter(ual => ual && ual.startsWith("did:dkg:") && !ual.includes("metadata:graph") && !ual.includes("current:graph"));

      dkgLogger.info("Found related UALs", { count: uals.length, claimPreview: claim.substring(0, 50), keywords });
      return [...new Set(uals)];
    } catch (error) {
      dkgLogger.warn("Failed to find related UALs", { error });
      return [];
    }
  }

  /**
   * Query Guardian Social Graph for health claims to fact-check
   * Uses the Guardian DKG endpoint to find social media posts about health topics
   */
  async findHealthClaimsToFactCheck(keywords: string[] = ["health", "medical", "vaccine", "nutrition"]): Promise<{
    success: boolean;
    posts: Array<{
      post: string;
      headline: string;
      url: string;
      datePublished?: string;
      author?: string;
      genre?: string;
      keywords?: string;
      description?: string;
    }>;
    error?: string;
  }> {
    try {
      const guardianEndpoint = process.env.GUARDIAN_DKG_ENDPOINT || "https://euphoria.origin-trail.network/dkg-sparql-query";

      const keywordFilters = keywords.map(keyword =>
        `CONTAINS(LCASE(?headline), "${keyword.toLowerCase()}")`
      ).join(" || ");

      const sparqlQuery = `
SELECT ?post ?headline ?description ?datePublished
WHERE {
  ?post <https://schema.org/headline> ?headline .
  OPTIONAL { ?post <https://schema.org/description> ?description }
  OPTIONAL { ?post <https://schema.org/datePublished> ?datePublished }
  FILTER(${keywordFilters})
}
ORDER BY DESC(?datePublished)
LIMIT 10
      `.trim();

      dkgLogger.info("Querying Guardian Social Graph", {
        endpoint: guardianEndpoint,
        keywords
      });

      const response = await fetch(guardianEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sparqlQuery }),
      });

      if (!response.ok) {
        throw new Error(`Guardian query failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      const rawPosts = result?.data?.data || [];

      const posts = rawPosts.map((item: any) => ({
        post: item.post || "",
        url: item.post || "",
        headline: (item.headline || "").replace(/^"|"$/g, ''),
        description: item.description ? item.description.replace(/^"|"$/g, '') : undefined,
        datePublished: item.datePublished ? item.datePublished.replace(/^"|"$/g, '') : undefined,
        author: item.author,
        genre: item.genre ? item.genre.replace(/^"|"$/g, '') : undefined,
        keywords: item.keywords ? item.keywords.replace(/^"|"$/g, '') : undefined,
      })).filter((p: any) => p.headline);

      dkgLogger.info("Guardian query completed", {
        postsFound: posts.length,
        keywords
      });

      return {
        success: true,
        posts,
      };
    } catch (error) {
      dkgLogger.error("Guardian Social Graph query failed", { error });
      return {
        success: false,
        posts: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

}
