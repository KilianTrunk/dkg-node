import type { DkgContext } from "@dkg/plugins";
import type { MedicalSource } from "../types/medicalSources";

export class DkgMedicalService {
  constructor(private ctx: DkgContext) {}

  private medicalSourceToJsonLd(source: MedicalSource, query: string, tier: "free" | "premium") {
    return {
      "@context": {
        "schema": "https://schema.org/",
        "dkg": "https://ontology.origintrail.io/dkg/1.0#"
      },
      "@graph": [
        {
          "@type": "schema:ScholarlyArticle",
          "@id": `urn:medical:source:${source.id}`,
          "schema:name": source.title,
          "schema:author": {
            "@type": "schema:Person",
            "schema:name": source.authors
          },
          "schema:isPartOf": {
            "@type": "schema:Periodical",
            "schema:name": source.journal
          },
          "schema:datePublished": source.year,
          "schema:about": query,
          "schema:description": source.abstract,
          "schema:url": source.url || (source.doi ? `https://doi.org/${source.doi}` : undefined),
          "schema:identifier": [
            {
              "@type": "schema:PropertyValue",
              "schema:propertyID": "sourceId",
              "schema:value": source.id
            },
            {
              "@type": "schema:PropertyValue",
              "schema:propertyID": "PMCID",
              "schema:value": source.pmcid
            },
            {
              "@type": "schema:PropertyValue",
              "schema:propertyID": "DOI",
              "schema:value": source.doi
            },
            {
              "@type": "schema:PropertyValue",
              "schema:propertyID": "accessTier",
              "schema:value": tier
            },
            {
              "@type": "schema:PropertyValue",
              "schema:propertyID": "searchQuery",
              "schema:value": query
            }
          ]
        }
      ]
    };
  }

  async publishSourcesToDkg(
    sources: MedicalSource[],
    query: string,
    tier: "free" | "premium"
  ): Promise<{ uals: string[]; errors: string[] }> {
    console.log(`\n[DKG] 📤 Publishing ${sources.length} medical sources to DKG...`);
    console.log(`[DKG]   Query: "${query}"`);
    console.log(`[DKG]   Tier: ${tier.toUpperCase()}`);

    const uals: string[] = [];
    const errors: string[] = [];

    for (const source of sources) {
      try {
        const jsonLd = this.medicalSourceToJsonLd(source, query, tier);

        console.log(`[DKG] 📝 Publishing: ${source.title.substring(0, 50)}...`);

        const result = await this.ctx.dkg.asset.create(
          { public: jsonLd },
          {
            epochsNum: 2,
            minimumNumberOfFinalizationConfirmations: 3,
            minimumNumberOfNodeReplications: 1,
          }
        );

        const ual = result?.UAL;
        if (ual) {
          uals.push(ual);
          console.log(`[DKG] ✅ Published: ${ual}`);
          console.log(`[DKG]   Explorer: https://dkg.origintrail.io/explore?ual=${encodeURIComponent(ual)}`);
        } else {
          const error = `Failed to get UAL for ${source.id}`;
          errors.push(error);
          console.log(`[DKG] ❌ ${error}`);
        }
      } catch (error) {
        const errorMsg = `Error publishing ${source.id}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        console.error(`[DKG] ❌ ${errorMsg}`);
      }
    }

    console.log(`\n[DKG] 📊 Publishing Summary:`);
    console.log(`[DKG]   ✅ Success: ${uals.length}`);
    console.log(`[DKG]   ❌ Failed: ${errors.length}`);

    return { uals, errors };
  }

  async publishAggregatedSourcesToDkg(
    sources: MedicalSource[],
    query: string,
    tier: "free" | "premium"
  ): Promise<{ ual?: string; error?: string }> {
    console.log(`\n[DKG] 📦 Publishing aggregated medical sources to DKG...`);
    console.log(`[DKG]   Query: "${query}"`);
    console.log(`[DKG]   Tier: ${tier.toUpperCase()}`);

    const itemListId = `urn:medical:bundle:${tier}:${Date.now()}`;

    const graph = [
      {
        "@type": "schema:ItemList",
        "@id": itemListId,
        "schema:name": `Medical sources for "${query}" (${tier} tier)`,
        "schema:description": `Aggregated medical sources for "${query}" (${tier})`,
        "schema:itemListElement": sources.map((source, index) => ({
          "@type": "schema:ListItem",
          "schema:position": index + 1,
          "schema:item": { "@id": `urn:medical:source:${source.id}` }
        })),
        "schema:identifier": [
          {
            "@type": "schema:PropertyValue",
            "schema:propertyID": "accessTier",
            "schema:value": tier
          },
          {
            "@type": "schema:PropertyValue",
            "schema:propertyID": "searchQuery",
            "schema:value": query
          }
        ]
      },
      ...sources.map((source) => ({
        "@type": "schema:ScholarlyArticle",
        "@id": `urn:medical:source:${source.id}`,
        "schema:name": source.title,
        "schema:author": {
          "@type": "schema:Person",
          "schema:name": source.authors
        },
        "schema:isPartOf": {
          "@type": "schema:Periodical",
          "schema:name": source.journal
        },
        "schema:datePublished": source.year,
        "schema:about": query,
        "schema:description": source.abstract,
        "schema:url": source.url || (source.doi ? `https://doi.org/${source.doi}` : undefined),
        "schema:identifier": [
          {
            "@type": "schema:PropertyValue",
            "schema:propertyID": "sourceId",
            "schema:value": source.id
          },
          {
            "@type": "schema:PropertyValue",
            "schema:propertyID": "PMCID",
            "schema:value": source.pmcid
          },
          {
            "@type": "schema:PropertyValue",
            "schema:propertyID": "DOI",
            "schema:value": source.doi
          },
          {
            "@type": "schema:PropertyValue",
            "schema:propertyID": "accessTier",
            "schema:value": tier
          },
          {
            "@type": "schema:PropertyValue",
            "schema:propertyID": "searchQuery",
            "schema:value": query
          }
        ]
      }))
    ];

    const jsonLd = {
      "@context": {
        "schema": "https://schema.org/",
        "dkg": "https://ontology.origintrail.io/dkg/1.0#"
      },
      "@graph": graph
    };

    try {
      const result = await this.ctx.dkg.asset.create(
        { public: jsonLd },
        {
          epochsNum: 2,
          minimumNumberOfFinalizationConfirmations: 3,
          minimumNumberOfNodeReplications: 1,
        }
      );

      const ual = result?.UAL;
      if (!ual) {
        console.log(`[DKG] ❌ Aggregated publish: missing UAL`);
        return { error: "Failed to obtain UAL for aggregated sources" };
      }

      console.log(`[DKG] ✅ Aggregated UAL: ${ual}`);
      console.log(`[DKG]   Explorer: https://dkg.origintrail.io/explore?ual=${encodeURIComponent(ual)}`);
      return { ual };
    } catch (error) {
      const errorMsg = `Error publishing aggregated sources: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[DKG] ❌ ${errorMsg}`);
      return { error: errorMsg };
    }
  }

  async queryMedicalSourcesFromDkg(query: string, tier?: "free" | "premium"): Promise<any[]> {
    console.log(`\n[DKG SPARQL] 🔍 Querying medical sources from DKG...`);
    console.log(`[DKG SPARQL]   Search: "${query}"`);
    if (tier) console.log(`[DKG SPARQL]   Filter: ${tier.toUpperCase()} tier only`);

    const sparqlQuery = `
PREFIX schema: <https://schema.org/>
PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>

SELECT ?subject ?title ?authors ?journal ?year ?abstract ?doi ?pmcid ?tier ?searchQuery
WHERE {
    GRAPH <current:graph> {
        ?g dkg:hasNamedGraph ?containedGraph .
    }
    GRAPH ?containedGraph {
        ?subject a schema:ScholarlyArticle ;
                 schema:name ?title ;
                 schema:author ?authorNode ;
                 schema:isPartOf ?journalNode .

        ?authorNode schema:name ?authors .
        ?journalNode schema:name ?journal .

        OPTIONAL { ?subject schema:datePublished ?year }
        OPTIONAL { ?subject schema:description ?abstract }
        OPTIONAL { ?subject schema:identifier ?identifierNode .
                  ?identifierNode schema:propertyID "DOI" ;
                                 schema:value ?doi }
        OPTIONAL { ?subject schema:identifier ?pmcidNode .
                  ?pmcidNode schema:propertyID "PMCID" ;
                            schema:value ?pmcid }
        OPTIONAL { ?subject schema:identifier ?tierNode .
                  ?tierNode schema:propertyID "accessTier" ;
                           schema:value ?tier }
        OPTIONAL { ?subject schema:identifier ?queryNode .
                  ?queryNode schema:propertyID "searchQuery" ;
                            schema:value ?searchQuery }

        FILTER(CONTAINS(LCASE(STR(?searchQuery)), LCASE("${query}")))
        ${tier ? `FILTER(?tier = "${tier}")` : ''}
    }
}
LIMIT 100
    `.trim();

    console.log(`[DKG SPARQL] 📝 Query:`);
    console.log(sparqlQuery);

    try {
      const results = await this.ctx.dkg.network.query(sparqlQuery, 'SELECT');

      console.log(`[DKG SPARQL] ✅ Found ${results.length} results from DKG`);

      return results;
    } catch (error) {
      console.error(`[DKG SPARQL] ❌ Query failed:`, error);
      return [];
    }
  }
}
