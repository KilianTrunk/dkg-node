/**
 * Literature Search Service
 * Integrates with external APIs to fetch medical literature and research
 */

interface ResearchPaper {
  id: string;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  doi?: string;
  abstract?: string;
  url: string;
  relevanceScore: number;
}

interface LiteratureSearchResult {
  query: string;
  totalResults: number;
  papers: ResearchPaper[];
  searchTime: number;
}

export class LiteratureService {
  private initialized = false;

  async initialize() {
    if (this.initialized) return;
    console.log("📚 Initializing Literature Search Service...");
    this.initialized = true;
  }

  /**
   * Search Europe PMC for medical literature using AI-powered query generation
   */
  async searchEuropePMC(query: string, limit: number = 5, aiService?: any): Promise<LiteratureSearchResult> {
    const startTime = Date.now();

    try {
      // Use AI to generate intelligent search terms if available
      let searchTerms: string[];
      if (aiService) {
        searchTerms = await this.generateAISearchTerms(query, aiService);
      } else {
        // Fallback to keyword extraction
        searchTerms = this.extractMedicalKeywords(query);
      }

      // Build intelligent search query
      const searchQuery = this.buildIntelligentPMCQuery(searchTerms);
      const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(searchQuery)}&format=json&resulttype=core&pageSize=${limit}&sort=relevance`;

      console.log(`🧠 AI-powered literature search for: "${query}"`);
      console.log(`🔍 Generated search terms: ${searchTerms.join(', ')}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'HealthGuardian-DKG/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Europe PMC API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const papers = this.parseEuropePMCResults(data);

      return {
        query,
        totalResults: data.hitCount || 0,
        papers,
        searchTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Europe PMC search failed:', error);
      throw new Error(`Literature search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Use AI to generate intelligent medical search terms
   */
  private async generateAISearchTerms(claim: string, aiService: any): Promise<string[]> {
    try {
      // Create a structured prompt for AI to generate medical search terms
      const analysis = await aiService.analyzeHealthClaim(claim, "Generate optimized medical literature search terms");

      // Extract search terms from the AI analysis
      // The AI response includes summary, sources, etc. - we can extract medical terms from these
      const aiText = `${analysis.summary} ${analysis.sources.join(' ')}`.toLowerCase();

      // Extract medical terms from AI response
      const medicalTerms: string[] = [];

      // Look for specific medical patterns in the AI response
      const termPatterns = [
        /\b(cancer|diabetes|heart|cardiovascular|stroke|depression|anxiety)\b/g,
        /\b(prevention|treatment|therapy|intervention|management)\b/g,
        /\b(risk|benefit|outcome|effect|impact)\b/g,
        /\b(exercise|diet|nutrition|medication|drug|therapy)\b/g,
        /\b(clinical|trial|study|research|meta.analysis)\b/g
      ];

      termPatterns.forEach(pattern => {
        const matches = aiText.match(pattern);
        if (matches) {
          medicalTerms.push(...matches);
        }
      });

      // Combine AI-extracted terms with manual keyword extraction
      const manualTerms = this.extractMedicalKeywords(claim);
      const allTerms = [...new Set([...medicalTerms, ...manualTerms])];

      // Limit to most relevant terms
      return allTerms.slice(0, 5);

    } catch (error) {
      console.warn('AI search term generation failed, using keyword extraction:', error);
      return this.extractMedicalKeywords(claim);
    }
  }

  /**
   * Build intelligent search query for Europe PMC using AI-generated terms
   */
  private buildIntelligentPMCQuery(searchTerms: string[]): string {
    // Build query with AI-generated medical search terms
    const queryParts = [];

    // Add main search terms from AI
    if (searchTerms.length > 0) {
      queryParts.push(`(${searchTerms.slice(0, 3).join(' OR ')})`);
    }

    // Focus on recent, high-quality literature
    queryParts.push('PUB_YEAR:[2010 TO 2025]');
    queryParts.push('(REVIEW OR META_ANALYSIS OR CLINICAL_TRIAL OR SYSTEMATIC_REVIEW)');

    // Exclude very old or non-peer-reviewed content
    queryParts.push('NOT CASE_REPORT');
    queryParts.push('NOT LETTER');

    return queryParts.join(' AND ');
  }

  /**
   * Extract medical keywords from health claims
   */
  private extractMedicalKeywords(claim: string): string[] {
    const text = claim.toLowerCase();

    // Common medical keywords and their variations
    const keywordMap: Record<string, string[]> = {
      'cancer': ['cancer', 'tumor', 'neoplasm', 'carcinoma', 'malignancy'],
      'diabetes': ['diabetes', 'insulin', 'glucose', 'blood sugar'],
      'heart': ['heart', 'cardiac', 'cardiovascular', 'coronary', 'myocardial'],
      'vaccine': ['vaccine', 'vaccination', 'immunization', 'immunity'],
      'diet': ['diet', 'nutrition', 'food', 'eating', 'calorie'],
      'exercise': ['exercise', 'physical activity', 'sport', 'fitness', 'workout'],
      'prevention': ['prevention', 'risk reduction', 'prophylaxis'],
      'treatment': ['treatment', 'therapy', 'intervention', 'management'],
      'risk': ['risk', 'hazard', 'danger', 'probability'],
      'benefit': ['benefit', 'advantage', 'improvement', 'outcome']
    };

    const foundKeywords: string[] = [];

    for (const [category, variations] of Object.entries(keywordMap)) {
      for (const variation of variations) {
        if (text.includes(variation)) {
          foundKeywords.push(category);
          break; // Only add category once
        }
      }
    }

    // Add specific terms found in the text
    const words = text.split(/\s+/);
    for (const word of words) {
      if (word.length > 3 && !foundKeywords.includes(word)) {
        // Check if it's a potential medical term
        if (this.isLikelyMedicalTerm(word)) {
          foundKeywords.push(word);
        }
      }
    }

    return [...new Set(foundKeywords)]; // Remove duplicates
  }

  /**
   * Check if a word is likely a medical term
   */
  private isLikelyMedicalTerm(word: string): boolean {
    // Common medical suffixes and prefixes
    const medicalIndicators = [
      'itis', 'osis', 'emia', 'pathy', 'ology', 'oma', 'plasia',
      'cardio', 'neuro', 'onco', 'psycho', 'immuno', 'hemo', 'hepato'
    ];

    return medicalIndicators.some(indicator => word.includes(indicator));
  }

  /**
   * Parse Europe PMC API response
   */
  private parseEuropePMCResults(data: any): ResearchPaper[] {
    if (!data.resultList?.result) {
      return [];
    }

    return data.resultList.result.map((item: any) => ({
      id: item.id || item.pmid || item.doi || `epmc_${Date.now()}`,
      title: item.title || 'Title not available',
      authors: this.parseAuthors(item.authorList?.author || []),
      journal: item.journalTitle || item.bookTitle || 'Journal not specified',
      year: parseInt(item.pubYear) || new Date().getFullYear(),
      doi: item.doi,
      abstract: item.abstractText,
      url: item.fullTextUrlList?.fullTextUrl?.[0]?.url || `https://europepmc.org/article/${item.source}/${item.id}`,
      relevanceScore: this.calculateRelevanceScore(item)
    }));
  }

  /**
   * Parse author list from Europe PMC format
   */
  private parseAuthors(authors: any[]): string[] {
    if (!Array.isArray(authors)) return [];

    return authors.map(author => {
      if (typeof author === 'string') return author;
      return `${author.firstName || ''} ${author.lastName || ''}`.trim() ||
             author.fullName ||
             author.collectiveName ||
             'Unknown Author';
    }).filter(name => name && name !== 'Unknown Author');
  }

  /**
   * Calculate relevance score based on various factors
   */
  private calculateRelevanceScore(item: any): number {
    let score = 50; // Base score

    // Boost for reviews and meta-analyses
    if (item.publicationType?.includes('REVIEW')) score += 20;
    if (item.publicationType?.includes('META_ANALYSIS')) score += 25;

    // Boost for recent publications
    const year = parseInt(item.pubYear) || 2020;
    if (year >= 2020) score += 15;
    else if (year >= 2015) score += 10;

    // Boost for high-impact journals (simplified check)
    const journal = (item.journalTitle || '').toLowerCase();
    if (journal.includes('nature') || journal.includes('science') ||
        journal.includes('lancet') || journal.includes('nejm') || journal.includes('jama')) {
      score += 15;
    }

    // Boost for having DOI and abstract
    if (item.doi) score += 5;
    if (item.abstractText) score += 5;

    return Math.min(score, 100);
  }

  /**
   * Get formatted literature summary for premium content
   */
  async getLiteratureSummary(claim: string, aiService?: any): Promise<string> {
    try {
      const results = await this.searchEuropePMC(claim, 3, aiService);

      if (results.papers.length === 0) {
        return 'Recommended further reading:\n• General medical literature review recommended\n• PubMed search for recent systematic reviews\n• Consultation with medical professionals advised';
      }

      const papersText = results.papers.map((paper, index) =>
        `${index + 1}. **${paper.title}**\n   Authors: ${paper.authors.slice(0, 3).join(', ')}${paper.authors.length > 3 ? ' et al.' : ''}\n   Journal: ${paper.journal} (${paper.year})\n   Relevance: ${paper.relevanceScore}/100`
      ).join('\n\n');

      return `📖 **Recent Medical Literature (${results.totalResults} total results found):**\n\n${papersText}\n\n*Literature search powered by Europe PMC - access full papers at europepmc.org*`;

    } catch (error) {
      console.warn('Literature search failed, using fallback:', error);
      // Fallback to generic recommendations
      return this.getFallbackLiterature(claim);
    }
  }

  /**
   * Fallback literature recommendations when API fails
   */
  private getFallbackLiterature(claim: string): string {
    const keywords = this.extractMedicalKeywords(claim);

    if (keywords.some(k => k.includes('cancer'))) {
      return 'Recommended further reading:\n• World Cancer Research Fund/American Institute for Cancer Research reports\n• National Cancer Institute clinical trials database\n• Cochrane Reviews on cancer prevention and treatment\n• PubMed search for recent oncology systematic reviews';
    }

    if (keywords.some(k => k.includes('vaccine'))) {
      return 'Recommended further reading:\n• Cochrane Library vaccine reviews\n• CDC vaccine efficacy studies\n• WHO immunization technical reports\n• PubMed meta-analyses on vaccine safety and effectiveness';
    }

    return 'Recommended further reading:\n• PubMed systematic reviews and meta-analyses\n• Cochrane Library evidence-based medicine reviews\n• Major medical journal articles (NEJM, JAMA, Lancet)\n• WHO and CDC technical reports and guidelines';
  }
}
