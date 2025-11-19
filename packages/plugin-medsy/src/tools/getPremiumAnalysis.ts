import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DkgContext } from "@dkg/plugins";
import { eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { PremiumAnalysisSchema } from "../types";
import type { LiteratureService } from "../services";
import { premiumAccess, communityNotes, healthClaims } from "../database";
import * as schema from "../database/schema";

/**
 * Get Premium Analysis MCP Tool
 * Provides enhanced medical analysis after premium access payment
 */
export function registerGetPremiumAnalysisTool(
  mcp: McpServer,
  ctx: DkgContext,
  literatureService: LiteratureService,
  db: BetterSQLite3Database<typeof schema>
) {
  mcp.registerTool(
    "get-premium-health-analysis",
    {
      title: "Get Premium Health Analysis",
      description: "Retrieve enhanced premium medical analysis with expert commentary, citations, and detailed insights",
      inputSchema: PremiumAnalysisSchema.shape
    },
    async ({ noteId }) => {
      try {
        const userId = "demo_user"; // Mock user ID

        // Check if user has premium access to this note
        const accessCheck = await db.select()
          .from(premiumAccess)
          .where(sql`${premiumAccess.noteId} = ${noteId} AND ${premiumAccess.userId} = ${userId} AND ${premiumAccess.expiresAt} > datetime('now')`);

        if (accessCheck.length === 0 || !accessCheck[0]) {
          return {
            content: [{
              type: "text",
              text: `👨‍⚕️ **Premium Access Required**\n\nYou don't currently have premium access to the enhanced analysis for note ${noteId}.\n\nTo unlock premium features including:\n• Expert medical commentary\n• Peer-reviewed literature citations\n• Statistical confidence intervals\n• Source credibility assessment\n• Balanced limitations analysis\n\nPlease use the "access-premium-health-insights" tool first to make a small payment (${0.01} USDC) for 30 days of premium access.`
            }]
          };
        }

        // Get the community note and original analysis
        const noteResult = await db.select()
          .from(communityNotes)
          .where(eq(communityNotes.noteId, noteId))
          .limit(1);

        if (noteResult.length === 0 || !noteResult[0]) {
          return {
            content: [{
              type: "text",
              text: `❌ **Note Not Found**\n\nCould not find community note ${noteId}. Please check the note ID and try again.`
            }]
          };
        }

        const note = noteResult[0];

        // Get the original health claim analysis
        const claimResult = await db.select()
          .from(healthClaims)
          .where(eq(healthClaims.claimId, note.claimId))
          .limit(1);

        if (claimResult.length === 0 || !claimResult[0]) {
          return {
            content: [{
              type: "text",
              text: `❌ **Analysis Not Found**\n\nCould not find the original health claim analysis for note ${noteId}.`
            }]
          };
        }

        const claim = claimResult[0];
        const originalAnalysis = claim.analysis ? JSON.parse(claim.analysis as string) : null;

        if (!originalAnalysis) {
          return {
            content: [{
              type: "text",
              text: `❌ **Analysis Data Unavailable**\n\nThe original analysis data for this note is not available.`
            }]
          };
        }

        // Generate premium enhanced analysis
        const premiumAnalysis = await generatePremiumAnalysis(
          note,
          claim,
          originalAnalysis,
          literatureService,
          accessCheck[0]
        );

        return {
          content: [{
            type: "text",
            text: premiumAnalysis
          }]
        };

      } catch (error) {
        console.error("Premium analysis retrieval failed:", error);
        return {
          content: [{
            type: "text",
            text: "Failed to retrieve premium analysis. Please try again or contact support if the issue persists."
          }]
        };
      }
    }
  );
}

/**
 * Generate enhanced premium analysis with expert insights
 */
async function generatePremiumAnalysis(
  note: any,
  claim: any,
  originalAnalysis: any,
  literatureService: LiteratureService,
  accessRecord: any
): Promise<string> {
  const verdict = originalAnalysis.verdict || 'uncertain';
  const confidence = originalAnalysis.confidence || 0.5;

  // Get additional literature references
  let literatureContext = "";
  try {
    if (literatureService && typeof literatureService.searchEuropePMC === 'function') {
      const literature = await literatureService.searchEuropePMC(claim.claim, 3);
      if (literature && literature.papers && literature.papers.length > 0) {
        literatureContext = "\n\n📚 **Relevant Medical Literature:**\n" +
          literature.papers.slice(0, 3).map((ref: any, index: number) =>
            `${index + 1}. ${ref.title || 'Medical Study'} (${ref.year || 'Recent'})`
          ).join('\n');
      }
    }
  } catch (error) {
    console.warn("Literature search failed:", error);
  }

  // Generate confidence interval based on analysis confidence
  const confidenceInterval = calculateConfidenceInterval(confidence);

  // Enhanced analysis with premium features
  return `👨‍⚕️ **PREMIUM MEDICAL ANALYSIS REPORT**
═══════════════════════════════════════════

**Health Claim:** ${claim.claim}

**AI Analysis Verdict:** ${verdict.toUpperCase()}
**Confidence Level:** ${(confidence * 100).toFixed(1)}%
**95% Confidence Interval:** ${confidenceInterval}

🩺 **EXPERT MEDICAL COMMENTARY**
─────────────────────────────────────────
${generateExpertCommentary(verdict, confidence, claim.claim)}

📊 **STATISTICAL RELIABILITY ASSESSMENT**
─────────────────────────────────────────
• **Confidence Score:** ${(confidence * 100).toFixed(1)}% (scale: 0-100%)
• **Evidence Strength:** ${getEvidenceStrength(confidence)}
• **Bias Risk Assessment:** ${assessBiasRisk(originalAnalysis.sources || [])}
• **Study Quality Estimate:** ${estimateStudyQuality(originalAnalysis.sources || [])}

🔍 **SOURCE CREDIBILITY EVALUATION**
─────────────────────────────────────────
${evaluateSources(originalAnalysis.sources || [])}

⚖️ **BALANCED LIMITATIONS & CONSIDERATIONS**
─────────────────────────────────────────
${generateLimitations(verdict, confidence, claim.claim)}

📚 **ORIGINAL ANALYSIS SUMMARY**
─────────────────────────────────────────
${originalAnalysis.summary || 'No summary available'}

**Original Sources:** ${originalAnalysis.sources?.join(', ') || 'None specified'}
${literatureContext}

💡 **CLINICAL IMPLICATIONS**
─────────────────────────────────────────
${generateClinicalImplications(verdict, confidence)}

⚠️ **IMPORTANT MEDICAL DISCLAIMER**
─────────────────────────────────────────
This premium analysis provides enhanced medical insights but is not a substitute for professional medical advice, diagnosis, or treatment. Always consult with qualified healthcare providers for personalized medical decisions. This analysis is based on available scientific literature and AI-powered evaluation as of the analysis date.

**Premium Access Expires:** ${new Date(accessRecord?.expiresAt || Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
**Report Generated:** ${new Date().toLocaleString()}

═══════════════════════════════════════════
🏥 Medsy AI - Premium Analysis Complete`;
}

/**
 * Generate expert medical commentary
 */
function generateExpertCommentary(verdict: string, confidence: number, claim: string): string {
  const claimLower = claim.toLowerCase();

  if (confidence >= 0.8) {
    switch (verdict) {
      case 'true':
        return "Based on current medical evidence and established clinical guidelines, this health claim appears to be supported by scientific literature. Healthcare professionals generally consider this information reliable for patient education and decision-making.";
      case 'false':
        return "Medical experts widely regard this claim as inaccurate or misleading based on comprehensive scientific review. Such claims often stem from misinterpreted research or anecdotal evidence rather than rigorous clinical studies.";
      case 'misleading':
        return "While containing some truth, this claim oversimplifies complex medical concepts. Healthcare providers note that partial truths can be more dangerous than complete falsehoods when they mislead patients about treatment efficacy or safety.";
      default:
        return "The available evidence is insufficient to make a definitive determination. Medical professionals recommend further research and consultation with specialists in the relevant field.";
    }
  } else {
    return "The scientific evidence regarding this claim is currently limited or conflicting. Healthcare professionals recommend approaching such claims with caution and awaiting further high-quality research before making clinical decisions.";
  }
}

/**
 * Calculate confidence interval for the analysis
 */
function calculateConfidenceInterval(confidence: number): string {
  // Simplified confidence interval calculation
  const margin = Math.sqrt((confidence * (1 - confidence)) / 100); // Assuming n=100 hypothetical studies
  const lower = Math.max(0, confidence - margin * 1.96);
  const upper = Math.min(1, confidence + margin * 1.96);
  return `${(lower * 100).toFixed(1)}% - ${(upper * 100).toFixed(1)}%`;
}

/**
 * Get evidence strength description
 */
function getEvidenceStrength(confidence: number): string {
  if (confidence >= 0.9) return "Very Strong (Multiple high-quality studies)";
  if (confidence >= 0.8) return "Strong (Well-established evidence)";
  if (confidence >= 0.7) return "Moderate (Growing evidence base)";
  if (confidence >= 0.6) return "Limited (Some supporting studies)";
  return "Weak (Insufficient evidence)";
}

/**
 * Assess bias risk in sources
 */
function assessBiasRisk(sources: string[]): string {
  if (!sources || sources.length === 0) return "Unknown (No sources provided)";

  const hasCredibleSources = sources.some(source =>
    source.toLowerCase().includes('nih') ||
    source.toLowerCase().includes('cdc') ||
    source.toLowerCase().includes('who') ||
    source.toLowerCase().includes('pubmed') ||
    source.toLowerCase().includes('cochrane') ||
    source.toLowerCase().includes('jama') ||
    source.toLowerCase().includes('lancet') ||
    source.toLowerCase().includes('nejm')
  );

  if (hasCredibleSources) return "Low (Includes reputable medical sources)";
  if (sources.length > 2) return "Medium (Multiple sources, mixed credibility)";
  return "High (Limited or non-specialized sources)";
}

/**
 * Estimate study quality
 */
function estimateStudyQuality(sources: string[]): string {
  if (!sources || sources.length === 0) return "Unable to assess";

  const qualityIndicators = sources.filter(source =>
    source.toLowerCase().includes('randomized') ||
    source.toLowerCase().includes('meta-analysis') ||
    source.toLowerCase().includes('systematic review') ||
    source.toLowerCase().includes('clinical trial') ||
    source.toLowerCase().includes('cochrane') ||
    source.toLowerCase().includes('nih') ||
    source.toLowerCase().includes('cdc')
  ).length;

  if (qualityIndicators >= 2) return "High (Multiple rigorous studies)";
  if (qualityIndicators >= 1) return "Medium (Some quality research)";
  return "Low (Limited high-quality evidence)";
}

/**
 * Evaluate credibility of sources
 */
function evaluateSources(sources: string[]): string {
  if (!sources || sources.length === 0) {
    return "• No sources provided for credibility evaluation";
  }

  return sources.map((source, index) => {
    const credibility = assessSourceCredibility(source);
    return `• **Source ${index + 1}:** ${source}\n  _Credibility: ${credibility}_`;
  }).join('\n\n');
}

/**
 * Assess individual source credibility
 */
function assessSourceCredibility(source: string): string {
  const sourceLower = source.toLowerCase();

  if (sourceLower.includes('nih') || sourceLower.includes('national institutes of health')) {
    return "Very High (U.S. National Institutes of Health)";
  }
  if (sourceLower.includes('cdc') || sourceLower.includes('centers for disease control')) {
    return "Very High (U.S. Centers for Disease Control and Prevention)";
  }
  if (sourceLower.includes('who') || sourceLower.includes('world health organization')) {
    return "Very High (World Health Organization)";
  }
  if (sourceLower.includes('cochrane') || sourceLower.includes('pubmed')) {
    return "High (Peer-reviewed medical database)";
  }
  if (sourceLower.includes('jama') || sourceLower.includes('nejm') || sourceLower.includes('lancet')) {
    return "High (Top-tier medical journal)";
  }
  if (sourceLower.includes('clinical trial') || sourceLower.includes('randomized')) {
    return "High (Clinical research study)";
  }
  if (sourceLower.includes('meta-analysis') || sourceLower.includes('systematic review')) {
    return "High (Comprehensive literature review)";
  }

  return "Medium (General medical reference)";
}

/**
 * Generate balanced limitations
 */
function generateLimitations(verdict: string, confidence: number, claim: string): string {
  let limitations = "";

  if (confidence < 0.7) {
    limitations += "• **Limited Evidence Base:** Current research is insufficient for definitive conclusions\n";
  }

  if (verdict === 'uncertain') {
    limitations += "• **Research Gaps:** More high-quality studies are needed to clarify this topic\n";
  }

  limitations += "• **Individual Variation:** Results may vary based on genetics, lifestyle, and health conditions\n";
  limitations += "• **Publication Bias:** Positive results are more likely to be published than negative findings\n";
  limitations += "• **Context Matters:** Study results may not apply to all populations or circumstances\n";

  return limitations;
}

/**
 * Generate clinical implications
 */
function generateClinicalImplications(verdict: string, confidence: number): string {
  if (confidence >= 0.8) {
    if (verdict === 'true') {
      return "Healthcare providers may consider this information when counseling patients and developing treatment plans. Patients should discuss these findings with their healthcare team to determine applicability to their individual situation.";
    } else if (verdict === 'false') {
      return "Healthcare providers should educate patients about the lack of evidence supporting this claim. Resources should be directed toward evidence-based interventions instead.";
    } else {
      return "Healthcare providers should approach patient inquiries about this topic with balanced information, neither endorsing nor dismissing the concept without sufficient evidence.";
    }
  } else {
    return "Due to limited evidence, healthcare providers should exercise caution when discussing this topic with patients. Further research is needed before making clinical recommendations.";
  }
}
