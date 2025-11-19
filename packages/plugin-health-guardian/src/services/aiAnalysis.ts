import type { AnalysisResult, IAIAnalysisService } from "../types";
import { aiLogger } from "./Logger";

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

// LLM provider will be accessed dynamically at runtime
// This avoids import issues while still using the agent's configured LLM

/**
 * AI-powered health claim analysis service using the agent's configured LLM
 */
export class AIAnalysisService implements IAIAnalysisService {
  private llm: any = null;
  private llmInitialized: boolean = false;

  async initializeAIClient() {
    // Lazy initialization - just mark that we should try to initialize later
    aiLogger.info("AI Analysis Service registered for lazy LLM initialization");
  }

  private async ensureLLM() {
    if (this.llmInitialized) return;

    try {
      // Try to access the global LLM provider that's set up by the agent
      const globalLLM = (globalThis as any).llmProvider;
      if (globalLLM) {
        this.llm = globalLLM;
        this.llmInitialized = true;
        aiLogger.info("AI Analysis Service initialized with global LLM", {
          provider: this.llm?.constructor?.name || 'Unknown',
          model: this.llm?.model || 'Unknown',
          temperature: this.llm?.temperature || 'Unknown'
        });
        return;
      }

      // Fallback: try dynamic import and initialize LLM directly
      try {
        const { llmProvider } = await import("../../../../apps/agent/src/shared/chat.js" as any);
        this.llm = await llmProvider();
        this.llmInitialized = true;
        aiLogger.info("AI Analysis Service initialized with imported LLM", {
          provider: this.llm?.constructor?.name || 'Unknown',
          model: this.llm?.model || 'Unknown',
          temperature: this.llm?.temperature || 'Unknown'
        });
      } catch (importError) {
        aiLogger.warn("Could not import LLM provider", { error: importError });
        throw new Error("LLM provider not available");
      }
    } catch (error) {
      aiLogger.error("Failed to initialize LLM", { error });
      this.llmInitialized = true; // Don't try again
      throw error;
    }
  }

  async analyzeHealthClaim(claim: string, context?: string): Promise<AnalysisResult> {
    // Ensure LLM is initialized (lazy loading)
    if (!this.llmInitialized) {
      try {
        await this.ensureLLM();
      } catch (error) {
        aiLogger.warn("LLM initialization failed, using mock analysis", { error });
      }
    }

    // Require real AI analysis - no mock fallbacks in production
    if (!this.llm) {
      throw new Error("AI service not initialized - cannot perform analysis without LLM");
    }

    return await this.performRealAnalysis(claim, context);
  }

  private async performRealAnalysis(claim: string, context?: string): Promise<AnalysisResult> {
    if (!this.llm) {
      throw new Error("LLM not initialized");
    }

    // Create a structured prompt for health claim analysis
    const systemPrompt = `You are a medical fact-checking AI that analyzes health claims for accuracy and reliability.
Your task is to evaluate health claims based on current medical science and provide a structured analysis.

For each claim, you must provide:
1. A verdict: "true", "false", "misleading", or "uncertain"
2. A confidence score: 0.0-1.0 (how confident you are in the verdict)
3. A clear summary explaining the analysis
4. Relevant medical sources that support your conclusion

Guidelines:
- "true": Claim is supported by current medical evidence
- "false": Claim contradicts established medical science
- "misleading": Claim oversimplifies or misrepresents medical facts
- "uncertain": Insufficient evidence or conflicting studies

Be precise, evidence-based, and cite credible medical sources.`;

    const userPrompt = `Please analyze this health claim: "${claim}"${context ? `\n\nAdditional context: ${context}` : ''}

Provide your analysis in the following JSON format:
{
  "verdict": "true|false|misleading|uncertain",
  "confidence": 0.0-1.0,
  "summary": "Clear explanation of your analysis",
  "sources": ["Source 1", "Source 2", "Source 3"]
}`;

    try {
      const response = await this.llm.invoke([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]);

      aiLogger.info("LLM Response received", {
        responseType: typeof response,
        hasContent: !!response?.content,
        contentType: typeof response?.content,
        contentLength: response?.content?.length || 0
      });

      // Extract content more robustly
      let content: string;
      if (typeof response.content === 'string') {
        content = response.content;
      } else if (response.content && typeof response.content === 'object') {
        // Handle different response formats
        if (Array.isArray(response.content)) {
          // Sometimes LLM returns array of message parts
          content = response.content.map((part: any) =>
            typeof part === 'string' ? part : part.text || JSON.stringify(part)
          ).join('');
        } else if (response.content.text) {
          content = response.content.text;
        } else {
          content = JSON.stringify(response.content);
        }
      } else {
        throw new Error("Unexpected response format from LLM");
      }

      aiLogger.info("Extracted content for parsing", { content: content.substring(0, 200) });

      // Try to extract JSON from the content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in LLM response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate the response structure
      if (!parsed.verdict || !parsed.summary) {
        aiLogger.warn("Invalid response structure", { parsed });
        throw new Error("Invalid response structure from LLM - missing required fields");
      }

      // Ensure verdict is valid
      const validVerdicts = ["true", "false", "misleading", "uncertain"];
      if (!validVerdicts.includes(parsed.verdict)) {
        aiLogger.warn("Invalid verdict value", { verdict: parsed.verdict });
        parsed.verdict = "uncertain";
      }

      // Clean HTML tags from AI-generated content
      const cleanSummary = cleanText(parsed.summary);
      const cleanSources = Array.isArray(parsed.sources)
        ? parsed.sources.map((source: any) => cleanText(source))
        : ["General Medical Literature"];

      return {
        verdict: parsed.verdict,
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)), // Clamp to 0-1
        summary: cleanSummary,
        sources: cleanSources
      };
    } catch (error) {
      aiLogger.error("Failed to parse LLM response", {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      throw new Error("Failed to analyze claim with AI");
    }
  }

  private async performMockAnalysis(claim: string, context?: string): Promise<AnalysisResult> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Enhanced mock analysis based on keywords
    const lowerClaim = claim.toLowerCase();

    if (lowerClaim.includes("cure") && lowerClaim.includes("cancer")) {
      return {
        summary: "This claim oversimplifies cancer treatment and may mislead patients about proven therapies.",
        confidence: 0.92,
        verdict: "misleading",
        sources: [
          "American Cancer Society Treatment Guidelines",
          "National Cancer Institute Clinical Trials Database",
          "Peer-reviewed Oncology Journals"
        ]
      };
    }

    if (lowerClaim.includes("vaccine") && lowerClaim.includes("autism")) {
      return {
        summary: "Extensive scientific research has conclusively shown no link between vaccines and autism.",
        confidence: 0.98,
        verdict: "false",
        sources: [
          "Centers for Disease Control and Prevention (CDC)",
          "World Health Organization (WHO)",
          "Institute of Medicine Vaccine Safety Report"
        ]
      };
    }

    if (lowerClaim.includes("vitamin c") && lowerClaim.includes("cold")) {
      return {
        summary: "Vitamin C may slightly reduce cold duration but does not prevent or cure colds.",
        confidence: 0.85,
        verdict: "misleading",
        sources: [
          "Cochrane Review of Vitamin C for Colds",
          "National Institutes of Health (NIH)",
          "Mayo Clinic Research"
        ]
      };
    }

    // Default response for claims that need further verification
    return {
      summary: "This claim requires further verification against current medical research and guidelines.",
      confidence: 0.60,
      verdict: "uncertain",
      sources: [
        "General Medical Literature",
        "PubMed Database",
        "Medical Professional Consultation Recommended"
      ]
    };
  }

}
