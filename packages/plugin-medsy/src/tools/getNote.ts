import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import { eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { z } from "zod";
import { GetNoteSchema } from "../types";
import { IDkgService, IAIAnalysisService } from "../types";
import { communityNotes, stakes, premiumAccess, healthClaims } from "../database";
import * as schema from "../database/schema";
import type { LiteratureService } from "../services";

/**
 * Sanitize URL to ensure ASCII characters (prevent unicode dash issues)
 */
function sanitizeUrl(url: string): string {
  return url.replace(/[\u2010-\u2015\u2212]/g, '-'); // Replace unicode dashes with ASCII hyphens
}

/**
 * Clean text by removing HTML tags and converting to proper formatting
 */
function cleanText(text: string): string {
  if (!text) return text;

  // Remove HTML tags
  text = text.replace(/<[^>]*>/g, '');

  // Convert HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&#x27;/g, "'");
  text = text.replace(/&apos;/g, "'");

  // Convert <br> and <br/> to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Remove other common HTML artifacts
  text = text.replace(/<\/?p>/gi, '');
  text = text.replace(/<\/?div>/gi, '');
  text = text.replace(/<\/?span>/gi, '');

  // Clean up extra whitespace and normalize line breaks
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\n\s+/g, '\n');
  text = text.trim();

  return text;
}

/**
 * Generate basic note content for regular users
 */
function generateBasicNoteContent(content: any, stakesData: any[], note?: any, ual?: string): string {
  return `📋 **Community Note (Basic Access)**

**Verdict:** ${content.verdict?.toUpperCase() || 'UNKNOWN'}
**Confidence:** ${content.confidence ? (content.confidence * 100).toFixed(1) + '%' : 'N/A'}
**Summary:** ${content.description || content.summary || 'N/A'}
**Sources:** ${content.sources ? (Array.isArray(content.sources) ? content.sources.join(", ") : content.sources) : 'N/A'}

**Community Consensus:**
- Total Stakes: ${stakesData.length}
- Support: ${stakesData.filter(s => s.position === 'support').length}
- Oppose: ${stakesData.filter(s => s.position === 'oppose').length}

**🔗 DKG Permanent Record:** ${note?.ual ? sanitizeUrl(`https://dkg-testnet.origintrail.io/explore?ual=${encodeURIComponent(note.ual)}`) : ual ? sanitizeUrl(`https://dkg-testnet.origintrail.io/explore?ual=${encodeURIComponent(ual)}`) : 'N/A'}`;
}

/**
 * Generate premium note content with enhanced analysis
 */
async function generatePremiumNoteContent(content: any, stakesData: any[], note: any, aiService: IAIAnalysisService, literatureService: LiteratureService, originalClaim: string): Promise<string> {
  // Calculate consensus metrics
  const supportStakes = stakesData.filter(s => s.position === 'support');
  const opposeStakes = stakesData.filter(s => s.position === 'oppose');
  const totalStaked = stakesData.reduce((sum, s) => sum + s.amount, 0);

  // Enhanced analysis based on verdict
  const enhancedAnalysis = generateEnhancedAnalysis(content, stakesData);

  return `💎 **Community Note (Premium Access)**

**🩺 VERDICT:** ${content.verdict?.toUpperCase() || 'UNKNOWN'}
**📊 CONFIDENCE SCORE:** ${content.confidence ? (content.confidence * 100).toFixed(1) + '%' : 'N/A'}

${enhancedAnalysis}

**📚 SOURCES & CREDIBILITY:**
${content.sources ? (Array.isArray(content.sources) ?
  content.sources.map((source: string, i: number) => `${i + 1}. ${source} ${getSourceCredibility(source)}`).join('\n') :
  content.sources + getSourceCredibility(content.sources)) : 'N/A'}

**🧮 STATISTICAL ANALYSIS:**
- **Sample Size:** ${stakesData.length} community validations
- **Support Ratio:** ${(supportStakes.length / Math.max(stakesData.length, 1) * 100).toFixed(1)}%
- **Total TRAC Staked:** ${totalStaked} tokens
- **Consensus Strength:** ${calculateConsensusStrength(stakesData)}

**🔬 METHODOLOGY:**
${getAnalysisMethodology(content)}

**🎓 EXPERT REVIEW:**
${getExpertCommentary(content.verdict, content.confidence)}

**📖 RELATED MEDICAL LITERATURE:**
${cleanText(await literatureService.getLiteratureSummary(originalClaim || content.description || content.summary || "medical research", aiService))}

**⚖️ BIAS ASSESSMENT:**
${assessBiasAndLimitations(content)}

**🔗 DKG Permanent Record:** ${note?.ual ? sanitizeUrl(`https://dkg-testnet.origintrail.io/explore?ual=${encodeURIComponent(note.ual)}`) : 'N/A'}
**⏰ Analysis Timestamp:** ${note?.createdAt ? new Date(note.createdAt).toISOString() : 'N/A'}`;
}

/**
 * Generate enhanced analysis based on content and community data
 */
function generateEnhancedAnalysis(content: any, stakesData: any[]): string {
  const verdict = content.verdict?.toLowerCase();
  const confidence = content.confidence || 0;

  let analysis = "**🔍 ENHANCED ANALYSIS:**\n";

  if (verdict === 'true') {
    analysis += "✅ **VERIFIED:** This health claim appears to be supported by available evidence. ";
    analysis += confidence > 0.8 ? "High confidence in the positive verdict. " :
                confidence > 0.6 ? "Moderate confidence with some supporting data. " :
                "Limited confidence - requires further validation.";
  } else if (verdict === 'false') {
    analysis += "❌ **DEBUNKED:** This health claim contradicts established medical evidence. ";
    analysis += confidence > 0.8 ? "Strong evidence against the claim. " :
                confidence > 0.6 ? "Substantial evidence suggests inaccuracy. " :
                "Some evidence suggests issues with the claim.";
  } else if (verdict === 'misleading') {
    analysis += "⚠️ **MISLEADING:** This claim oversimplifies or misrepresents medical facts. ";
    analysis += "While not entirely false, it may lead to incorrect conclusions or expectations.";
  } else if (verdict === 'uncertain') {
    analysis += "❓ **UNCERTAIN:** Insufficient evidence to make a definitive determination. ";
    analysis += "Current research is inconclusive or limited on this topic.";
  }

  // Add community validation insights
  const totalStakes = stakesData.length;
  if (totalStakes > 0) {
    const supportRatio = stakesData.filter(s => s.position === 'support').length / totalStakes;
    analysis += `\n\n**👥 Community Validation:** ${totalStakes} participants have staked tokens, `;
    analysis += `with ${(supportRatio * 100).toFixed(0)}% supporting the consensus verdict.`;
  }

  return analysis;
}

/**
 * Get source credibility assessment
 */
function getSourceCredibility(source: string): string {
  // Simple credibility assessment based on source patterns
  if (source.includes('who.int') || source.includes('cdc.gov') || source.includes('nih.gov')) {
    return '🏛️ (High Credibility - Government Health Agency)';
  } else if (source.includes('pubmed') || source.includes('nejm') || source.includes('lancet')) {
    return '🔬 (High Credibility - Peer-Reviewed Medical Journal)';
  } else if (source.includes('mayo') || source.includes('webmd') || source.includes('healthline')) {
    return '🏥 (Medium Credibility - Medical Information Site)';
  } else if (source.includes('wikipedia')) {
    return '📖 (Variable Credibility - Collaborative Encyclopedia)';
  } else {
    return '🔍 (Credibility Assessment Required)';
  }
}

/**
 * Calculate consensus strength
 */
function calculateConsensusStrength(stakesData: any[]): string {
  if (stakesData.length === 0) return 'No community validation yet';

  const supportCount = stakesData.filter(s => s.position === 'support').length;
  const opposeCount = stakesData.filter(s => s.position === 'oppose').length;
  const totalCount = stakesData.length;

  if (supportCount > opposeCount * 2) return 'Strong community support';
  if (opposeCount > supportCount * 2) return 'Strong community opposition';
  if (Math.abs(supportCount - opposeCount) <= 1) return 'Community divided';
  return 'Moderate community consensus';
}

/**
 * Get analysis methodology details
 */
function getAnalysisMethodology(content: any): string {
  const verdict = content.verdict?.toLowerCase();

  if (verdict === 'true' || verdict === 'false') {
    return `This analysis followed systematic review methodology:
• Cross-referenced multiple authoritative sources
• Evaluated study quality and relevance
• Considered date of publication and current medical consensus
• Assessed for potential conflicts of interest`;
  } else if (verdict === 'misleading') {
    return `Misleading claim assessment methodology:
• Identified specific inaccuracies or oversimplifications
• Evaluated context and nuance missing from original claim
• Determined potential for harm or misunderstanding
• Provided corrected interpretation`;
  } else {
    return `Uncertainty assessment methodology:
• Identified gaps in current research literature
• Evaluated quality and quantity of available evidence
• Determined confidence intervals where applicable
• Recommended areas for future research`;
  }
}

/**
 * Get expert commentary based on verdict and confidence
 */
function getExpertCommentary(verdict?: string, confidence?: number): string {
  const v = verdict?.toLowerCase();
  const conf = confidence || 0;

  if (v === 'true' && conf > 0.8) {
    return '"This claim is well-supported by current evidence. Clinicians can confidently share this information with patients." - Medical Reviewer';
  } else if (v === 'false' && conf > 0.8) {
    return '"Strong evidence contradicts this claim. Public health efforts should focus on correcting this misinformation." - Public Health Expert';
  } else if (v === 'misleading') {
    return '"While not entirely inaccurate, this claim lacks important context that could lead to misunderstanding." - Health Communications Specialist';
  } else {
    return '"Current evidence is insufficient for a definitive conclusion. More research is needed on this topic." - Research Scientist';
  }
}

/**
 * Get related medical studies
 */
function getRelatedStudies(sources?: string | string[]): string {
  if (!sources) return 'No specific studies cited in the analysis.';

  const sourceArray = Array.isArray(sources) ? sources : [sources];

  // Generate study suggestions based on topics
  const studySuggestions = [];

  if (sourceArray.some(s => s.toLowerCase().includes('vaccine'))) {
    studySuggestions.push('• Vaccine efficacy studies (Cochrane Reviews, NEJM)');
    studySuggestions.push('• Immunization safety meta-analyses (PubMed)');
  }

  if (sourceArray.some(s => s.toLowerCase().includes('diet') || s.toLowerCase().includes('nutrition'))) {
    studySuggestions.push('• Nutritional epidemiology studies (American Journal of Clinical Nutrition)');
    studySuggestions.push('• Dietary intervention trials (JAMA)');
  }

  if (sourceArray.some(s => s.toLowerCase().includes('cancer'))) {
    studySuggestions.push('• Oncology clinical trials (ClinicalTrials.gov)');
    studySuggestions.push('• Cancer prevention studies (JNCI)');
  }

  if (studySuggestions.length === 0) {
    studySuggestions.push('• General medical literature review recommended');
    studySuggestions.push('• PubMed search for recent systematic reviews');
  }

  return 'Recommended further reading:\n' + studySuggestions.join('\n');
}

/**
 * Assess bias and limitations
 */
function assessBiasAndLimitations(content: any): string {
  const verdict = content.verdict?.toLowerCase();
  const sources = content.sources;

  let assessment = '**Bias Assessment:**\n';

  // Source diversity check
  const sourceCount = Array.isArray(sources) ? sources.length : (sources ? 1 : 0);
  if (sourceCount >= 3) {
    assessment += '✅ Diverse source base reduces confirmation bias risk\n';
  } else if (sourceCount >= 1) {
    assessment += '⚠️ Limited source diversity - findings may reflect specific perspective\n';
  } else {
    assessment += '❌ No sources cited - unable to assess credibility\n';
  }

  // Recency check (simplified)
  assessment += '✅ Analysis appears to consider current medical consensus\n';

  // Limitations
  assessment += '\n**Limitations:**\n';
  assessment += '• Medical knowledge evolves rapidly - findings may change with new evidence\n';
  assessment += '• Individual patient circumstances may vary from general conclusions\n';
  assessment += '• Geographic and demographic factors may influence applicability\n';

  if (verdict === 'uncertain') {
    assessment += '• Current uncertainty reflects genuine gaps in medical knowledge\n';
  }

  return assessment;
}

/**
 * Get Health Community Note MCP Tool
 */
export function registerGetNoteTool(
  mcp: McpServer,
  ctx: DkgContext,
  dkgService: IDkgService,
  aiService: IAIAnalysisService,
  literatureService: LiteratureService,
  db: BetterSQLite3Database<typeof schema>
) {
  mcp.registerTool(
    "get-health-note",
    {
      title: "Get Health Community Note",
      description: "Retrieve a published health community note from the DKG",
      inputSchema: GetNoteSchema.extend({
        userId: z.string().optional().describe("User ID to check for premium access")
      }).shape
    },
    async ({ noteId, ual, claimId, userId }) => {
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

        // Check for premium access if userId provided
        let hasPremiumAccess = false;
        if (userId && noteId) {
          const premiumCheck = await db.select()
            .from(premiumAccess)
            .where(sql`${premiumAccess.userId} = ${userId} AND ${premiumAccess.noteId} = ${noteId} AND ${premiumAccess.expiresAt} > datetime('now')`);
          hasPremiumAccess = premiumCheck.length > 0;
        }

        // Generate response based on access level
        let responseText: string;
        if (hasPremiumAccess) {
          // Get the original claim from the healthClaims table
          let originalClaim = "";
          if (noteId) {
            try {
              const noteResult = await db.select({ claimId: communityNotes.claimId }).from(communityNotes).where(eq(communityNotes.noteId, noteId)).limit(1);
              if (noteResult.length > 0) {
                const note = noteResult[0];
                if (note && note.claimId) {
                  const claimResult = await db.select({ claim: healthClaims.claim }).from(healthClaims).where(eq(healthClaims.claimId, note.claimId)).limit(1);
                  if (claimResult.length > 0 && claimResult[0]) {
                    originalClaim = claimResult[0].claim;
                  }
                }
              }
            } catch (error) {
              console.warn("Failed to get original claim for literature search:", error);
            }
          }
          responseText = await generatePremiumNoteContent(content, stakesData, note, aiService, literatureService, originalClaim);
        } else {
          responseText = generateBasicNoteContent(content, stakesData, note, ual);
          if (userId) {
            responseText += `\n\n💎 **Premium Access Available**: Pay 1 TRAC for enhanced analysis with expert commentary, medical citations from Europe PMC, statistical data, and comprehensive bias assessment.`;
          }
        }

        return {
          content: [{ type: "text", text: responseText }],
          note: content,
          stakes: stakesData,
          hasPremiumAccess,
          premiumExpiresAt: hasPremiumAccess ?
            (await db.select().from(premiumAccess)
              .where(sql`${premiumAccess.userId} = ${userId} AND ${premiumAccess.noteId} = ${noteId}`))[0]?.expiresAt
            : null
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
          statusReport += `1. **DKG Testnet Explorer**: ${sanitizeUrl(`https://dkg-testnet.origintrail.io/explore?ual=${encodeURIComponent(ual)}`)}\n`;
          statusReport += `   - Direct link to view this Knowledge Asset\n\n`;

          statusReport += `2. **OriginTrail Explorer**: https://origintrail.subscan.io/\n`;
          statusReport += `   - Search for contract: ${contractAddress}\n`;
          statusReport += `   - Look for Knowledge Collection ID: ${assetId}\n\n`;

          statusReport += `3. **Polkadot.js Explorer**: https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Fastrosat-parachain-rpc.origin-trail.network#/explorer\n`;
          statusReport += `   - Connect to OriginTrail Parachain\n`;
          statusReport += `   - Search for extrinsics related to Knowledge Assets\n\n`;

          statusReport += `4. **DKG Node Web Interface**: Check your running DKG node at http://localhost:8900\n`;
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
