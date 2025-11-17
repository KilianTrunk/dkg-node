import type { MedicalSource } from "../types/medicalSources";
import { X402PaymentService } from "./x402PaymentService";

export class MedicalSourcesService {
  private readonly EUROPE_PMC =
    process.env.EUROPE_PMC_URL || "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
  constructor(private readonly paymentService?: X402PaymentService) {}

  private async fetchWithX402(url: string, headers: Record<string, string>): Promise<Response> {
    const initial = await fetch(url, { headers });
    if (initial.status !== 402 || !this.paymentService) return initial;

    const requirement = this.paymentService.parse402Headers(initial);
    const payment = await this.paymentService.settle402({
      payTo: requirement.payTo,
      amount: requirement.amount,
    });
    if (!payment.txHash) {
      throw new Error(payment.error || "X402 payment failed");
    }

    const retryHeaders = {
      ...headers,
      "x-402-payment-tx": payment.txHash,
    };
    return fetch(url, { headers: retryHeaders });
  }

  /**
   * Fetch sources from Europe PMC (core = includes abstracts, fullTextUrlList)
   */
  private async fetchSources(query: string, limit: number): Promise<MedicalSource[]> {
    if (!query || typeof query !== "string") {
      throw new Error("Query is required to fetch medical sources");
    }
    const trimmed = query.trim();
    const url =
      `${this.EUROPE_PMC}?query=${encodeURIComponent(trimmed)}` +
      `&format=json&pageSize=${limit}&resultType=core`;

    try {
      console.log(`[Medical API] 📡 Calling Europe PMC: ${url}`);
      const headers = {
        "User-Agent": "dkg-health-guardian/1.0 (mailto:info@example.com)",
        Accept: "application/json",
      };
      const response = await this.fetchWithX402(url, headers);
      if (!response.ok) {
        console.warn(
          `[Medical API] ⚠️ Europe PMC HTTP ${response.status} ${response.statusText}`,
        );
        return [];
      }

      const data = await response.json();
      const results = data?.resultList?.result || [];

      console.log(`[Medical API] Europe PMC raw items: ${results.length}`);

      const pickUrl = (item: any): string | undefined => {
        const fullText = item.fullTextUrlList?.fullTextUrl || [];
        const oa = fullText.find((f: any) => f.availabilityCode === "OA");
        if (oa?.url) return oa.url;
        if (item.pmcid) return `https://europepmc.org/articles/${item.pmcid}?pdf=render`;
        if (item.doi) return `https://doi.org/${item.doi}`;
        return undefined;
      };

      const sources: MedicalSource[] = [];
      const seen = new Set<string>();

      for (const item of results) {
        const id = item.pmcid || item.pmid || item.doi || `epmc_${Math.random().toString(36).slice(2)}`;
        const url = pickUrl(item);
        const dedupKey = (item.doi || item.pmcid || url || id || "").toLowerCase();
        if (dedupKey && seen.has(dedupKey)) continue;
        if (dedupKey) seen.add(dedupKey);

        sources.push({
          id,
          title: item.title || "No title",
          authors: item.authorString || "Unknown",
          journal: item.journalInfo?.journal?.title || "Unknown",
          year: item.pubYear || item.journalInfo?.yearOfPublication || "N/A",
          pmcid: item.pmcid,
          doi: item.doi,
          abstract:
            typeof item.abstractText === "string"
              ? item.abstractText.substring(0, 800)
              : "No abstract available",
          url,
        });

        if (sources.length >= limit) break;
      }

      console.log(
        `[Medical API] 📚 Processed ${sources.length} sources (Europe PMC)`,
      );
      if (sources.length === 0) {
        console.warn(`[Medical API] ⚠️ Europe PMC returned 0 sources for query="${trimmed}"`);
      }
      return sources;
    } catch (error) {
      console.error(`[Medical API] ❌ Error fetching sources from Europe PMC:`, error);
      return [];
    }
  }

  async fetchPremiumSources(query: string): Promise<MedicalSource[]> {
    console.log(`[Medical API] 💎 Fetching PREMIUM sources (Europe PMC) for: "${query}"`);
    const sources = await this.fetchSources(query, 2);
    console.log(
      `[Medical API] PREMIUM links:`,
      sources.map((s) => `${s.title} -> ${s.url || s.doi || s.id}`),
    );
    return sources;
  }
}
