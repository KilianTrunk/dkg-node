import { DKG_CONFIG } from "../config";
import type { DkgPublishResult, DkgAsset, IDkgService } from "../types";
import { dkgLogger } from "./Logger";

/**
 * DKG Edge Node ServiceReal DKG integration
 */
export class DkgService implements IDkgService {
  private dkgClient: any = null;

  async initialize(ctx?: any) {
    // If context is provided (from plugin), use ctx.dkg
    // Otherwise, this service is being used standalone
    if (ctx?.dkg) {
      this.dkgClient = ctx.dkg;
      dkgLogger.info("DKG Service initialized with real DKG client from context");
    } else {
      // Fallback for standalone usage (mock)
      dkgLogger.warn("DKG Service initialized in mock mode - no DKG context provided");
      this.dkgClient = {
        asset: {
          create: this.mockPublish.bind(this),
          get: this.mockGet.bind(this)
        }
      };
    }
  }

  /**
   * Publish a Knowledge Asset to the DKG
   */
  async publishKnowledgeAsset(content: any, privacy: "private" | "public" = "private"): Promise<DkgPublishResult> {
    if (!this.dkgClient) {
      throw new Error("DKG client not initialized");
    }

    dkgLogger.info("Publishing Knowledge Asset to DKG", {
      contentPreview: JSON.stringify(content).substring(0, 200) + "...",
      privacy
    });

    // Wrap content as per DKG API requirements
    const wrappedContent = { [privacy]: content };

    try {
      // Use real DKG Edge Node (following working pattern from dkg-publisher)
      const result = await this.dkgClient.asset.create(wrappedContent, {
        epochsNum: DKG_CONFIG.publishing.epochsNum,
        minimumNumberOfFinalizationConfirmations: DKG_CONFIG.publishing.minimumNumberOfFinalizationConfirmations,
        minimumNumberOfNodeReplications: DKG_CONFIG.publishing.minimumNumberOfNodeReplications,
      });

      // Check for DKG API errors first
      if (result?.operation?.publish?.errorType || result?.operation?.publish?.errorMessage) {
        const errorType = result.operation.publish.errorType;
        const errorMessage = result.operation.publish.errorMessage;
        throw new Error(`DKG API Error: ${errorType} - ${errorMessage}`);
      }

      // Validate that we actually have a UAL
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

    // Skip mock UALs - these don't exist on real DKG
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
   * Mock publishing for development
   */
  private async mockPublish(content: any): Promise<DkgPublishResult> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const mockUAL = `did:dkg:${DKG_CONFIG.blockchain.name}:health-asset:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;

    dkgLogger.info("Mock DKG publish successful", { ual: mockUAL });

    return {
      UAL: mockUAL,
      transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
      blockNumber: Math.floor(Math.random() * 1000000)
    };
  }

  /**
   * Mock retrieval for development
   */
  private async mockGet(ual: string): Promise<any> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Return mock data for testing
    return {
      assertion: {
        public: {
          verdict: "mock",
          confidence: 0.5,
          description: "Mock data - DKG not available",
          sources: ["Mock Source"]
        }
      }
    };
  }

  /**
   * Execute arbitrary SPARQL against DKG
   */
  async executeSparqlQuery(query: string, options?: { paranetUAL?: string }) {
    if (!this.dkgClient?.graph?.query) {
      throw new Error("DKG client not initialized for SPARQL queries");
    }

    dkgLogger.info("SPARQL query requested", {
      queryPreview: query.substring(0, 120) + "...",
      paranetUAL: options?.paranetUAL,
    });

    return this.dkgClient.graph.query(query, "SELECT", options?.paranetUAL ? { paranetUAL: options.paranetUAL } : undefined);
  }

  async querySocialGraph(params: {
    keyword: string;
    publisherKey?: string;
    limit?: number;
    paranetUAL?: string;
  }): Promise<{ query: string; paranetUAL?: string; count: number; data: any[] }> {
    if (!this.dkgClient?.graph?.query) {
      throw new Error("DKG client not initialized");
    }

    const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);
    const keyword = (params.keyword || "").replace(/\"/g, '\\"');
    const publisherFilter = params.publisherKey
      ? `FILTER(BOUND(?publishedBy) && ?publishedBy = "${params.publisherKey}")`
      : "";

    const sparql = `
PREFIX schema: <http://schema.org/>
PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>

SELECT DISTINCT ?graph ?post ?headline ?body ?aboutName ?keywordName ?author ?publisher ?publishedBy ?publishTime
WHERE {
  GRAPH <current:graph> { ?kc dkg:hasNamedGraph ?graph . }
  GRAPH ?graph {
    ?post a <http://schema.org/SocialMediaPosting> .
    OPTIONAL { ?post <http://schema.org/headline> ?headline . }
    OPTIONAL { ?post <http://schema.org/articleBody> ?body . }
    OPTIONAL { ?post <http://schema.org/about> ?about . ?about <http://schema.org/name> ?aboutName . }
    OPTIONAL { ?post <http://schema.org/keywords> ?kw . ?kw <http://schema.org/name> ?keywordName . }
    OPTIONAL { ?post <http://schema.org/author> ?author . }
    OPTIONAL { ?post <http://schema.org/publisher> ?publisher . }
    FILTER(
      CONTAINS(LCASE(COALESCE(?headline, "")), LCASE("${keyword}")) ||
      CONTAINS(LCASE(COALESCE(?body, "")), LCASE("${keyword}")) ||
      (BOUND(?aboutName) && CONTAINS(LCASE(?aboutName), LCASE("${keyword}"))) ||
      (BOUND(?keywordName) && CONTAINS(LCASE(?keywordName), LCASE("${keyword}")))
    )
  }
  OPTIONAL {
    GRAPH <metadata:graph> {
      ?kc dkg:hasNamedGraph ?graph .
      OPTIONAL { ?kc dkg:publishedBy ?publishedBy . }
      OPTIONAL { ?kc dkg:publishTime ?publishTime . }
    }
  }
  ${publisherFilter}
}
LIMIT ${limit}
    `.trim();

    dkgLogger.info("Querying DKG social graph", {
      keyword: params.keyword,
      limit,
      paranetUAL: params.paranetUAL,
    });

    const data = await this.dkgClient.graph.query(
      sparql,
      "SELECT",
      params.paranetUAL ? { paranetUAL: params.paranetUAL } : undefined,
    );

    return { query: sparql, paranetUAL: params.paranetUAL, count: Array.isArray(data) ? data.length : 0, data: data || [] };
  }
}
