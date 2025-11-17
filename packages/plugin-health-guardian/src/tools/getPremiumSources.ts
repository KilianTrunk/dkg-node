
import type { DkgContext } from "@dkg/plugins";
import { z } from "zod";
import type { MedicalSource } from "../types/medicalSources";
import { MedicalSourcesService } from "../services/medicalSourcesService";
import { X402PaymentService } from "../services/x402PaymentService";
import { DkgMedicalService } from "../services/dkgMedicalService";

const PREMIUM_QUERY_CACHE_MS = 5 * 60 * 1000; // 5 minutes
type PremiumCacheEntry = {
  status: "pending" | "success" | "failed";
  timestamp: number;
  response?: { content: any[]; isError?: boolean };
  sources?: MedicalSource[];
  txHash?: string;
  publishedUal?: string;
};
const premiumQueryCache = new Map<string, PremiumCacheEntry>();

export function registerGetPremiumSourcesTool(
  mcp: McpServer,
  ctx: DkgContext
) {
  const paymentLogger = (ctx as any)?.logger || console;
  const paymentService = new X402PaymentService(paymentLogger);
  const medicalService = new MedicalSourcesService(paymentService);
  const dkgMedicalService = new DkgMedicalService(ctx);

  mcp.registerTool(
    "purchase_premium_medical_sources",
    {
      description:
        "Pays 0.02 NEURO (autoPay or provided tx hash), verifies payment, then returns 2 premium Europe PMC sources. Asks if you want them published to the DKG; only publish after explicit confirmation. Fails if payment is missing or unverified.",
      inputSchema: z.object({
        query: z.string().describe("Medical research query (e.g., 'diabetes treatment', 'cancer immunotherapy')").optional(),
        paymentTxHash: z.string().describe("Optional NeuroWeb testnet transaction hash for 0.02 NEURO payment").optional(),
        autoPay: z.union([z.boolean(), z.string()]).describe("Set true to attempt auto-payment using configured wallet (0.02 NEURO)").optional(),
        __lastUserText: z.string().optional(),
      }),
    },
    async (args: any, meta?: any) => {
      try {
        console.log(`[Medical Sources] Incoming args: ${JSON.stringify(args)}`);
        if (meta) console.log(`[Medical Sources] Incoming meta: ${JSON.stringify(meta)}`);
        const rawQuery =
          typeof args === "string"
            ? args
            : typeof args?.query === "string"
              ? args.query
              : typeof args?.inputSchema?.query === "string"
                ? args.inputSchema.query
                : typeof args?.inputSchema?.inputSchema?.query === "string"
                  ? args.inputSchema.inputSchema.query
                  : typeof args?.arguments?.query === "string"
                    ? args.arguments.query
                    : typeof args?.arguments?.inputSchema?.query === "string"
                      ? args.arguments.inputSchema.query
                      : typeof args?.__lastUserText === "string"
                        ? args.__lastUserText
                        : typeof args?.text === "string"
                          ? args.text
                          : "";

        const query =
          typeof rawQuery === "string"
            ? rawQuery
                .replace(/^sources:\s*/i, "")
                .replace(/^get medical sources for:\s*/i, "")
                .replace(/^\"|\"$/g, "")
                .trim()
            : "";

        console.log(`[Medical Sources] Parsed query="${query}" from raw="${rawQuery}"`);
        const normalizedQuery = query.toLowerCase();
        const now = Date.now();

        const cached = premiumQueryCache.get(normalizedQuery);
        if (cached && now - cached.timestamp < PREMIUM_QUERY_CACHE_MS) {
          if (cached.status === "pending") {
            console.log(
              `[Medical Sources] Premium request already in progress for "${query}" (debounced)`,
            );
            return {
              content: [
                {
                  type: "text",
                  text:
                    `Premium sources for "${query}" are already being retrieved. Reusing in-progress request; please wait a moment.`,
                },
              ],
            };
          }

          if (cached.status === "success") {
            console.log(
              `[Medical Sources] Skipping repeat premium request for "${query}" (recently served)`,
            );
            return cached.response!;
          }
        } else if (cached && now - cached.timestamp >= PREMIUM_QUERY_CACHE_MS) {
          premiumQueryCache.delete(normalizedQuery);
        }

        // Mark as pending to debounce duplicate tool calls while we process
        premiumQueryCache.set(normalizedQuery, { status: "pending", timestamp: now });

        let paymentTxHash = args?.paymentTxHash as string | undefined;
        const autoPay = args?.autoPay !== undefined ? Boolean(args.autoPay) : false;

        if (!query) {
          premiumQueryCache.delete(normalizedQuery);
          return {
            content: [{ type: "text", text: "Query is required to fetch premium medical sources. Please include your topic (e.g., 'diabetes treatment')." }],
            isError: true,
          };
        }

        if (!paymentTxHash && !autoPay) {
          const req = paymentService.getPaymentRequest();
          premiumQueryCache.delete(normalizedQuery);
          return {
            content: [
              {
                type: "text",
                text:
                  `Premium sources require payment: ${req.amount} ${req.currency} on ${req.network}.\n` +
                  `Send to: ${req.address}\n` +
                  `Chain: ${req.chainId}\n\n` +
                  `Confirm to proceed: reply with autoPay: true, or provide paymentTxHash after sending 0.02 NEURO.`,
              },
            ],
            isError: true,
          };
        }

        // auto-pay if requested
        if (!paymentTxHash && autoPay) {
          const payResult = await paymentService.sendPayment();
          if (payResult.txHash) {
            paymentTxHash = payResult.txHash;
            console.log(`[X402] Premium tx hash: ${paymentTxHash}`);
          } else {
            premiumQueryCache.set(normalizedQuery, { status: "failed", timestamp: Date.now() });
            return {
              content: [
                {
                  type: "text",
                  text: `Payment failed: ${payResult.error || "unknown error"}. Provide a valid tx hash for 0.02 NEURO or retry with autoPay:true once funded.`,
                },
              ],
              isError: true,
            };
          }
        }

        if (!paymentTxHash) {
          premiumQueryCache.set(normalizedQuery, { status: "failed", timestamp: Date.now() });
          return {
            content: [
              {
                type: "text",
                text: "Payment is required for premium sources. Provide paymentTxHash or retry with autoPay:true.",
              },
            ],
            isError: true,
          };
        }

        const verification = await paymentService.verifyPayment(paymentTxHash);
        if (!verification.verified) {
          premiumQueryCache.set(normalizedQuery, { status: "failed", timestamp: Date.now() });
          return {
            content: [
              {
                type: "text",
                text: `Payment verification failed for ${paymentTxHash}. No premium sources returned. Please provide a valid 0.02 NEURO tx hash.`,
              },
            ],
            isError: true,
          };
        }

        console.log(`[X402] Premium tx verified: ${paymentTxHash}`);

        const premiumSources = await medicalService.fetchPremiumSources(query);
        if (!premiumSources.length) {
          console.warn(`[Medical API] ⚠️ No premium sources returned for query="${query}"`);
        } else {
          console.log(
            `[Medical Sources] PREMIUM titles/links:`,
            premiumSources.map((s) => `${s.title} -> ${s.url || s.doi || s.id}`),
          );
        }

        const result = {
          isPremium: true,
          txHash: paymentTxHash,
          totalSources: premiumSources.length,
          confidence: 0.9,
          premiumSources: (premiumSources || []).map((s) => ({
            title: s.title,
            authors: s.authors,
            journal: s.journal,
            year: s.year,
            id: s.id,
            doi: s.doi,
            url: s.url,
            abstract: s.abstract,
          })),
          dkgPublished: null,
          premiumAnswer:
            premiumSources && premiumSources.length
              ? `Premium evidence supports the claim with ${premiumSources.length} recent sources (see links below).`
              : "No premium sources found.",
        };

        const response = {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
            {
              type: "text",
              text:
                `Payment tx hash: ${paymentTxHash}\n` +
                `Explorer: https://neuroweb-testnet.subscan.io/extrinsic/${encodeURIComponent(
                  paymentTxHash
                )}\n` +
                "Premium sources:\n" +
                result.premiumSources
                  .map((s, i) => `${i + 1}. ${s.title} (${s.year}) - ${s.url || s.doi || "no link"}`)
                  .join("\n") +
                `\n\nWant this published as a DKG Knowledge Asset? Reply with "publish premium sources" to publish this result.`,
            },
          ],
        };

        premiumQueryCache.set(normalizedQuery, {
          status: "success",
          timestamp: Date.now(),
          response,
          sources: premiumSources,
          txHash: paymentTxHash,
        });

        return response;
      } catch (error: any) {
        console.error(`[Medical Sources] Unexpected error`, error);
        premiumQueryCache.set(normalizedQuery, { status: "failed", timestamp: Date.now() });
        return {
          content: [{ type: "text", text: `Error fetching premium sources: ${error?.message || error}` }],
          isError: true,
        };
      }
    }
  );

  // tool to publish the last premium sources for a query to DKG (requires recent purchase)
  mcp.registerTool(
    "publish_premium_medical_sources",
    {
      description: "Publish the last purchased premium medical sources for a query to the DKG as a single knowledge asset.",
      inputSchema: z.object({
        query: z.string().describe("Medical research query that was just purchased (e.g., 'diabetes treatment')"),
      }),
    },
    async ({ query }: { query: string }) => {
      const normalizedQuery = (query || "").toLowerCase().trim();
      if (!normalizedQuery) {
        return {
          content: [
            {
              type: "text",
              text: "Query is required to publish premium sources. Please provide the same query you used for purchase (e.g., 'diabetes treatment').",
            },
          ],
          isError: true,
        };
      }

      const cached = premiumQueryCache.get(normalizedQuery);
      if (!cached || cached.status !== "success" || !cached.sources?.length) {
        return {
          content: [
            {
              type: "text",
              text: `No recent premium sources found for "${query}". Please run purchase_premium_medical_sources first, then retry publish.`,
            },
          ],
          isError: true,
        };
      }

      // Avoid double publish
      if (cached.publishedUal) {
        return {
          content: [
            {
              type: "text",
              text: `Already published to DKG: ${cached.publishedUal}`,
            },
          ],
        };
      }

      const publishResult = await dkgMedicalService.publishAggregatedSourcesToDkg(
        cached.sources,
        query,
        "premium",
      );

      if (publishResult.error || !publishResult.ual) {
        premiumQueryCache.set(normalizedQuery, {
          ...cached,
          status: "failed",
          timestamp: Date.now(),
        });
        return {
          content: [
            {
              type: "text",
              text: `Publishing to DKG failed: ${publishResult.error || "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }

      premiumQueryCache.set(normalizedQuery, {
        ...cached,
        status: "success",
        timestamp: Date.now(),
        publishedUal: publishResult.ual,
      });

      return {
        content: [
          {
            type: "text",
            text: `Published premium sources to DKG: ${publishResult.ual}`,
          },
        ],
      };
    },
  );

  // tool to get payment request details
  mcp.registerTool(
    "get_payment_request",
    {
      description: "Get payment details for premium medical sources access (0.02 NEURO on NeuroWeb Testnet)",
      inputSchema: z.object({}),
    },
    async () => {
      const paymentRequest = paymentService.getPaymentRequest();

      const info = {
        message: "Send 0.02 NEURO to unlock 2 premium medical sources",
        network: paymentRequest.network,
        chainId: paymentRequest.chainId,
        paymentAddress: paymentRequest.address,
        amount: `${paymentRequest.amount} ${paymentRequest.currency}`,
        instructions: [
          "1. Open your wallet (MetaMask, etc.)",
          "2. Switch to NeuroWeb Testnet",
          "3. Send 0.02 NEURO to the payment address",
          "4. Copy the transaction hash",
          "5. Use purchase_premium_medical_sources with paymentTxHash parameter"
        ]
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(info, null, 2)
          }
        ]
      };
    }
  );

  // tool to query medical sources from DKG using SPARQL
  mcp.registerTool(
    "query_dkg_medical_sources",
    {
      description: "Query medical research sources from the DKG (Decentralized Knowledge Graph) using SPARQL. This retrieves previously published medical sources from the DKG by search query.",
      inputSchema: z.object({
        query: z.string().describe("Medical research query to search in DKG (e.g., 'diabetes treatment')"),
        tier: z.enum(["free", "premium"]).describe("Optional: Filter by access tier (free or premium)").optional(),
      }),
    },
    async (args: any) => {
      const { query, tier } = args as { query: string; tier?: string };
      const tierFilter = tier === "premium" || tier === "free" ? tier : undefined;

      console.log(`\n${"=".repeat(60)}`);
      console.log(`[DKG Query] 🔍 Querying DKG for medical sources`);
      console.log(`  Query: "${query}"`);
      if (tier) console.log(`  Tier filter: ${tier.toUpperCase()}`);
      console.log(`${"=".repeat(60)}\n`);

      const results = await dkgMedicalService.queryMedicalSourcesFromDkg(query, tierFilter);

      console.log(`\n${"=".repeat(60)}`);
      console.log(`[DKG Query] ✅ Query complete`);
      console.log(`  Results found: ${results.length}`);
      console.log(`${"=".repeat(60)}\n`);

      const response = {
        query,
        tierFilter: tierFilter || "all",
        totalResults: results.length,
        sources: results,
        note: "These sources were previously published to the DKG. Use get_medical_sources to fetch new sources from Europe PMC API."
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    }
  );
}
