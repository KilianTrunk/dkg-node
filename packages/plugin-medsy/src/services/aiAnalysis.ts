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
        aiLogger.error("LLM initialization failed", { error });
        throw new Error("AI service not initialized - cannot perform analysis without LLM");
      }
    }

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
    const systemPrompt = `You are a medical fact-checking AI. Analyze health claims and respond ONLY with valid JSON.

Verdict types:
- "true": Supported by medical evidence
- "false": Contradicts medical science
- "misleading": Oversimplifies or misrepresents facts
- "uncertain": Insufficient evidence

You MUST respond with ONLY valid JSON in this exact format:
{
  "verdict": "true|false|misleading|uncertain",
  "confidence": 0.85,
  "summary": "Brief evidence-based explanation",
  "sources": ["Source 1", "Source 2"]
}

Do NOT include any text before or after the JSON object.`;

    const userPrompt = `Analyze this health claim: "${claim}"${context ? `\n\nContext: ${context}` : ''}

CRITICAL: Respond ONLY with valid JSON. No explanatory text before or after the JSON.

Required JSON format:
{
  "verdict": "true|false|misleading|uncertain",
  "confidence": 0.85,
  "summary": "Brief evidence-based explanation",
  "sources": ["Medical source 1", "Medical source 2", "Medical source 3"]
}

Your response must be parseable JSON only.`;

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

      let jsonText = content;

      const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1];
      } else {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseError) {
        aiLogger.error("Failed to parse JSON", {
          jsonText: jsonText.substring(0, 500),
          originalContent: content.substring(0, 500)
        });
        throw new Error(`No valid JSON found in LLM response. Response started with: "${content.substring(0, 100)}..."`);
      }

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

}
