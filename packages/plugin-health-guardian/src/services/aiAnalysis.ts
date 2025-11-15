import { AI_CONFIG } from "../config";
import type { AnalysisResult } from "../types";

// LLM provider will be accessed dynamically at runtime
// This avoids import issues while still using the agent's configured LLM

/**
 * AI-powered health claim analysis service using the agent's configured LLM
 */
export class AIAnalysisService {
  private llm: any = null;
  private llmInitialized: boolean = false;

  async initializeAIClient() {
    // Lazy initialization - just mark that we should try to initialize later
    console.log("🤖 AI Analysis Service registered for lazy LLM initialization");
  }

  private async ensureLLM() {
    if (this.llmInitialized) return;

    try {
      // Try to access the global LLM provider that's set up by the agent
      const globalLLM = (globalThis as any).llmProvider;
      if (globalLLM) {
        this.llm = globalLLM;
        this.llmInitialized = true;
        console.log("✅ AI Analysis Service initialized with global LLM:", {
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
        console.log("✅ AI Analysis Service initialized with imported LLM:", {
          provider: this.llm?.constructor?.name || 'Unknown',
          model: this.llm?.model || 'Unknown',
          temperature: this.llm?.temperature || 'Unknown'
        });
      } catch (importError) {
        console.warn("Could not import LLM provider:", importError);
        throw new Error("LLM provider not available");
      }
    } catch (error) {
      console.error("❌ Failed to initialize LLM:", error);
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
        console.warn("LLM initialization failed, using mock analysis:", error);
      }
    }

    // Try real AI analysis first
    if (this.llm) {
      try {
        return await this.performRealAnalysis(claim, context);
      } catch (error) {
        console.warn("Real AI analysis failed, falling back to mock:", error);
      }
    }

    // Fallback to mock analysis
    return this.performMockAnalysis(claim, context);
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

      // Parse the JSON response
      const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      const parsed = JSON.parse(content);

      // Validate the response structure
      if (!parsed.verdict || !parsed.summary || !Array.isArray(parsed.sources)) {
        throw new Error("Invalid response structure from LLM");
      }

      return {
        verdict: parsed.verdict,
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)), // Clamp to 0-1
        summary: parsed.summary,
        sources: parsed.sources
      };
    } catch (error) {
      console.error("Failed to parse LLM response:", error);
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
