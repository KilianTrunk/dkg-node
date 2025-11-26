import { DKG_CONFIG } from "../config";
import type { DkgPublishResult, DkgAsset, IDkgService } from "../types";
import { dkgLogger } from "./Logger";

/**
 * DKG Edge Node ServiceReal DKG integration
 */
export class DkgService implements IDkgService {
  private dkgClient: any = null;

  async initialize(ctx?: any) {
    // Require DKG context - no mock fallbacks allowed for production
    if (!ctx?.dkg) {
      throw new Error("DKG context required - cannot initialize DKG service without proper DKG client");
    }

    this.dkgClient = ctx.dkg;
    dkgLogger.info("DKG Service initialized with real DKG client from context");
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

    // Create simple JSON-LD for DKG (following working pattern from publishNote)
    const jsonLdContent: any = {
      "@context": "https://schema.org/",
      "@type": "MedicalWebPage",
      "@id": `urn:health-claim:${Date.now()}`,
      "name": "Health Claim Analysis",
      "description": content.claim || "AI-powered health claim analysis",
      "text": content.summary || "Evidence-based health claim verification",
      "datePublished": new Date().toISOString(),
      "publisher": {
        "@type": "Organization",
        "name": "Medsy AI"
      },
      // Custom properties (DKG may accept these)
      "claimId": content.claimId,
      "claim": content.claim,
      "agentId": content.agentId,
      "agentName": content.agentName,
      "verdict": content.verdict,
      "confidence": content.confidence,
      "sources": content.sources,
      "analysis": content.analysis
    };

    // Connect to existing knowledge assets if UALs provided
    if (relatedUals && relatedUals.length > 0) {
      jsonLdContent.mentions = relatedUals;
      jsonLdContent.references = relatedUals.slice(0, 3); // Limit references to first 3
    }

    const wrappedContent = { [privacy]: jsonLdContent };

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
      // Extract key words from claim (remove common words)
      const claimLower = claim.toLowerCase();
      const keywords = claimLower
        .split(/\s+/)
        .filter(word => word.length > 3 && !['that', 'this', 'with', 'from', 'have', 'been', 'does', 'make', 'makes'].includes(word))
        .slice(0, 3); // Use top 3 keywords

      if (keywords.length === 0) {
        keywords.push(claimLower.substring(0, 20)); // Fallback to first 20 chars
      }

      // Build query that searches for any of the keywords in content
      // Use simpler approach: search in any content field
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
      return [...new Set(uals)]; // Remove duplicates
    } catch (error) {
      dkgLogger.warn("Failed to find related UALs", { error });
      return [];
    }
  }

}
