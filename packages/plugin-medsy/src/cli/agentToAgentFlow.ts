import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, "../../../../apps/agent/.env") });
config({ path: path.resolve(__dirname, "../../.env.medsy") });
console.log("Loaded MEDSY_DATABASE_PATH:", process.env.MEDSY_DATABASE_PATH);

import chalk from "chalk";
import boxen from "boxen";
import { ethers } from "ethers";
import { HealthClaimWorkflowService } from "../services/HealthClaimWorkflowService";
import { AIAnalysisService } from "../services/aiAnalysis";
import { X402PaymentService } from "../services/x402PaymentService";
import { DkgService } from "../services/dkgService";
import { AgentAuthService, type AgentIdentity } from "../services/agentAuthService";
import { TokenomicsService } from "../services/tokenomicsService";
import { BlockchainProvider } from "../services/blockchainProvider";
import { TokenContractService } from "../services/tokenContractService";

interface A2AMessage {
  messageId: string;
  from: string;
  to: string;
  timestamp: number;
  messageType: "request" | "response" | "proposal" | "acceptance" | "rejection";
  payload: any;
}

async function getWalletWithSufficientBalance(
  primaryPrivateKey: string | undefined,
  fallbackPrivateKey: string | undefined,
  requiredAmount: number,
  tokenType: "NEURO" | "TRAC"
): Promise<{ privateKey: string; address: string; isFallback: boolean }> {
  const rpcUrl = process.env.DKG_BLOCKCHAIN_RPC || "https://lofar-testnet.origin-trail.network";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  if (primaryPrivateKey) {
    try {
      const primaryWallet = new ethers.Wallet(primaryPrivateKey);
      let balance: bigint;

      if (tokenType === "NEURO") {
        balance = await provider.getBalance(primaryWallet.address);
      } else {
        const tracAddress = process.env.MEDSY_TRAC_TOKEN_ADDRESS || "0xFfFFFFff00000000000000000000000000000001";
        const tracAbi = ["function balanceOf(address) view returns (uint256)"];
        const tracContract = new ethers.Contract(tracAddress, tracAbi, provider);
        balance = await tracContract.balanceOf(primaryWallet.address);
      }

      const balanceInEther = parseFloat(ethers.formatEther(balance));

      if (balanceInEther >= requiredAmount) {
        log.info(`✓ Primary wallet has sufficient ${tokenType}: ${balanceInEther.toFixed(6)}`);
        return { privateKey: primaryPrivateKey, address: primaryWallet.address, isFallback: false };
      } else {
        log.info(`⚠ Primary wallet has insufficient ${tokenType}: ${balanceInEther.toFixed(6)} (need ${requiredAmount})`);
      }
    } catch (error) {
      log.info(`⚠ Could not check primary wallet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (fallbackPrivateKey) {
    try {
      const fallbackWallet = new ethers.Wallet(fallbackPrivateKey);
      log.info(`⟳ Falling back to DKG_PUBLISH_WALLET: ${fallbackWallet.address}`);
      return { privateKey: fallbackPrivateKey, address: fallbackWallet.address, isFallback: true };
    } catch (error) {
      throw new Error(`Fallback wallet also unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`No wallet available with sufficient ${tokenType} balance`);
}

const log = {
  header: (text: string) => {
    console.log("\n" + chalk.bold.cyan("═".repeat(60)));
    console.log(chalk.bold.cyan(`  ${text}`));
    console.log(chalk.bold.cyan("═".repeat(60)) + "\n");
  },

  subheader: (text: string) => {
    console.log(chalk.bold.yellow(`\n▸ ${text}\n`));
  },

  box: (title: string, content: Record<string, any>, color: "green" | "blue" | "yellow" | "magenta" | "cyan" = "blue") => {
    const lines = Object.entries(content)
      .map(([key, value]) => `${chalk.gray(key + ":")} ${chalk.white(String(value))}`)
      .join("\n");

    console.log(boxen(lines, {
      title: chalk[color](title),
      padding: 1,
      margin: { top: 0, bottom: 1, left: 2, right: 2 },
      borderStyle: "round",
      borderColor: color
    }));
  },

  agent: (name: string, message: string) => {
    const colors: Record<string, typeof chalk.blue> = {
      "Analyzer Agent": chalk.magenta,
      "Buyer Agent": chalk.cyan,
      "System": chalk.gray
    };
    const color = colors[name] || chalk.white;
    console.log(`  ${color("◉")} ${chalk.bold(name)}: ${message}`);
  },

  a2a: (from: string, to: string, msgType: string, text: string) => {
    console.log(chalk.gray(`    ↔ [A2A ${msgType}] ${from} → ${to}: `) + chalk.italic(text));
  },

  success: (text: string) => {
    console.log(chalk.green(`  ✓ ${text}`));
  },

  error: (text: string) => {
    console.log(chalk.red(`  ✗ ${text}`));
  },

  info: (text: string) => {
    console.log(chalk.gray(`  ℹ ${text}`));
  },

  price: (amount: number) => {
    return chalk.yellow(`${amount.toFixed(4)} TRAC`);
  }
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function sendA2AMessage(from: string, to: string, messageType: A2AMessage["messageType"], payload: any): A2AMessage {
  return {
    messageId: generateMessageId(),
    from,
    to,
    timestamp: Date.now(),
    messageType,
    payload
  };
}

class AnalyzerAgent {
  private agentId: string;
  private identity: AgentIdentity;
  private llm: any;
  private workflowService: HealthClaimWorkflowService;

  constructor(identity: AgentIdentity, llm: any, workflowService: HealthClaimWorkflowService) {
    this.agentId = identity.agentId;
    this.identity = identity;
    this.llm = llm;
    this.workflowService = workflowService;
  }

  async generateClaim(): Promise<{ claim: string; context: string }> {
    if (!this.llm) {
      return {
        claim: "Taking 1000mg of Vitamin C daily prevents common cold infections",
        context: "Health influencer social media post"
      };
    }

    const prompt = `Generate ONE realistic health claim about supplements, nutrition, or wellness that needs fact-checking.
Make it specific and verifiable.

Respond with JSON:
{
  "claim": "the specific health claim",
  "context": "where this claim appears (social media, blog, etc.)"
}`;

    try {
      const response = await this.llm.invoke([{ role: "user", content: prompt }]);
      const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      log.info("AI claim generation failed, using fallback");
    }

    return {
      claim: "Taking 1000mg of Vitamin C daily prevents common cold infections",
      context: "Health influencer social media post"
    };
  }

  async analyzeClaim(claim: string, context?: string): Promise<any> {
    log.agent("Analyzer Agent", "Executing analysis workflow (AI + DKG + Staking)...");
    
    const result = await this.workflowService.executeHealthClaimWorkflow(
      this.identity,
      claim,
      context
    );

    if (!result.success) {
      throw new Error(`Analysis failed: ${result.errors.join(", ")}`);
    }

    return result;
  }

  async proposePrice(confidence: number): Promise<number> {
    if (!this.llm) {
      return 0.5 + (confidence * 2.5);
    }

    const prompt = `You are selling a health claim analysis with ${(confidence * 100).toFixed(1)}% confidence.
Propose a fair price in TRAC tokens:
- High confidence (>90%): 2.5-3.5 TRAC
- Good confidence (75-90%): 1.5-2.5 TRAC
- Medium confidence (50-75%): 0.8-1.5 TRAC
- Low confidence (<50%): 0.3-0.8 TRAC

Respond with only the number (price in TRAC).`;

    try {
      const response = await this.llm.invoke([{ role: "user", content: prompt }]);
      const content = typeof response.content === 'string' ? response.content : String(response.content);
      const priceMatch = content.match(/[\d.]+/);
      if (priceMatch) {
        return parseFloat(priceMatch[0]);
      }
    } catch (error) {
      log.info("AI pricing failed, using formula");
    }

    return 0.5 + (confidence * 2.5);
  }

  async handleRequest(message: A2AMessage): Promise<A2AMessage> {
    const { claim, context } = message.payload;
    
    const result = await this.analyzeClaim(claim, context);
    const price = await this.proposePrice(result.analysis?.confidence || 0.5);

    return sendA2AMessage(this.agentId, message.from, "response", {
      claimId: result.claimId,
      noteId: result.noteId,
      ual: result.ual,
      analysis: result.analysis,
      price,
      message: "Analysis complete, published to DKG"
    });
  }

  async handleProposal(message: A2AMessage): Promise<A2AMessage> {
    const { offeredPrice, originalPrice } = message.payload;
    log.agent("Analyzer Agent", `Received counter-offer of ${log.price(offeredPrice)} for original price of ${log.price(originalPrice)}`);
    
    if (this.llm) {
      const prompt = `You are selling an analysis for ${originalPrice.toFixed(4)} TRAC.
Buyer offers ${offeredPrice.toFixed(4)} TRAC.

Decide:
1. "accept" if offer is reasonable (>70% of your price)
2. "reject" if offer is too low

Respond with only: accept or reject`;

      try {
        const response = await this.llm.invoke([{ role: "user", content: prompt }]);
        const content = typeof response.content === 'string' ? response.content : String(response.content);
        const decision = content.toLowerCase().includes("accept") ? "acceptance" : "rejection";
        
        return sendA2AMessage(this.agentId, message.from, decision as any, {
          finalPrice: decision === "acceptance" ? offeredPrice : null,
          message: decision === "acceptance" ? "Offer accepted" : "Offer too low"
        });
      } catch (error) {
        log.info("AI decision failed, using fallback");
      }
    }

    const acceptable = offeredPrice >= originalPrice * 0.7;
    return sendA2AMessage(this.agentId, message.from, acceptable ? "acceptance" : "rejection", {
      finalPrice: acceptable ? offeredPrice : null,
      message: acceptable ? "Offer accepted" : "Offer too low"
    });
  }
}

class BuyerAgent {
  private agentId: string;
  private identity: AgentIdentity;
  private llm: any;
  private x402Service: X402PaymentService;
  private budget: number;
  private recipientAddress: string = "";

  constructor(identity: AgentIdentity, llm: any, x402Service: X402PaymentService, budget: number) {
    this.agentId = identity.agentId;
    this.identity = identity;
    this.llm = llm;
    this.x402Service = x402Service;
    this.budget = budget;
  }

  setRecipient(address: string) {
    this.recipientAddress = address;
  }

  requestAnalysis(analyzerAgentId: string, claim: string, context?: string): A2AMessage {
    return sendA2AMessage(this.agentId, analyzerAgentId, "request", {
      claim,
      context,
      requestType: "health-claim-analysis"
    });
  }

  async evaluatePrice(price: number, confidence?: number): Promise<{ accept: boolean; counterOffer?: number; reasoning: string }> {
    log.agent("Buyer Agent", `Evaluating price of ${log.price(price)} against budget of ${log.price(this.budget)} with confidence of ${confidence ? (confidence * 100).toFixed(1) + '%' : 'N/A'}`);

    const maxWillingToPay = confidence ? Math.min(10, 1 + confidence * 9) : this.budget;
    log.info(`Buyer's maximum willingness to pay for this confidence level: ${log.price(maxWillingToPay)}`);

    if (price <= maxWillingToPay) {
      return { accept: true, reasoning: "Price is within acceptable range for this confidence level" };
    }

    const counterOffer = Math.min(this.budget, maxWillingToPay, price * 0.85);
    return {
      accept: false,
      counterOffer,
      reasoning: `Price is too high for this confidence level. Proposing a counter-offer of ${log.price(counterOffer)}.`
    };
  }

  makeProposal(analyzerAgentId: string, originalPrice: number, offeredPrice: number): A2AMessage {
    return sendA2AMessage(this.agentId, analyzerAgentId, "proposal", {
      originalPrice,
      offeredPrice,
      message: `Counter-offer: ${offeredPrice.toFixed(4)} TRAC`
    });
  }

  async processPayment(price: number, claimId: string): Promise<string> {
    log.agent("Buyer Agent", `Processing x402 payment of ${log.price(price)}...`);

    if (!this.recipientAddress) {
      throw new Error("Recipient address not set - cannot process payment");
    }

    try {
      const payment = await this.x402Service.createPaymentRequest(
        price,
        `Health claim analysis: ${claimId}`,
        this.agentId
      );

      log.info(`Payment ID: ${payment.paymentId}`);
      log.info(`Currency: TRAC (OriginTrail)`);

      const wallet = await getWalletWithSufficientBalance(
        process.env.BUYER_AGENT_PRIVATE_KEY,
        process.env.DKG_PUBLISH_WALLET,
        price * 1.2,
        "TRAC"
      );

      if (wallet.isFallback) {
        log.info(`💡 Using DKG_PUBLISH_WALLET as fallback for payment`);
      }

      log.info(`Transferring ${price.toFixed(4)} TRAC to ${this.recipientAddress}...`);

      const blockchainProvider = new BlockchainProvider();
      await blockchainProvider.initialize(wallet.privateKey);
      const tokenService = new TokenContractService(blockchainProvider);
      await tokenService.initialize();

      const amountInWei = ethers.parseUnits(price.toFixed(6), 18);

      const tx = await tokenService.transferTrac(this.recipientAddress, amountInWei);

      log.success(`TRAC transfer successful!`);
      log.info(`Transaction hash: ${tx.hash}`);

      const completed = await this.x402Service.processPayment(
        payment.paymentId,
        wallet.address,
        tx.hash
      );

      log.success(`Payment verified and completed`);
      return tx.hash;
    } catch (error) {
      log.error(`x402 payment failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

async function runA2AFlow() {
  log.header("AGENT-TO-AGENT (A2A) PROTOCOL FLOW");
  log.info("Initializing autonomous agents with real services...");

  const startTime = Date.now();

  let llm: any = null;
  let aiService: AIAnalysisService;
  let dkgService: DkgService;
  let tokenomicsService: TokenomicsService | undefined;
  let x402Service: X402PaymentService;
  let agentAuthService: AgentAuthService;
  let workflowService: HealthClaimWorkflowService;

  try {
    llm = (globalThis as any).llmProvider;
    if (!llm) {
      try {
        const { llmProvider } = await import("../../../../apps/agent/src/shared/chat.js" as any);
        llm = await llmProvider();
      } catch (error) {
        log.error("LLM not available - agents will use fallback logic");
      }
    }
  } catch (error) {
    log.error("LLM initialization failed");
  }

  try {
    aiService = new AIAnalysisService();
    if (llm) {
      (globalThis as any).llmProvider = llm;
      await aiService.initializeAIClient();
      log.success("AI Analysis Service initialized");
    }
  } catch (error) {
    log.error(`AI Service error: ${error instanceof Error ? error.message : String(error)}`);
    aiService = new AIAnalysisService();
  }

  try {
    dkgService = new DkgService();
    await dkgService.initialize();
    log.success("DKG Service initialized (standalone mode)");
  } catch (error) {
    log.error(`DKG Service error: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error("Critical: DKG Service failed to initialize");
  }

  try {
    tokenomicsService = new TokenomicsService();
    await tokenomicsService.initialize();
    log.success("Tokenomics Service initialized");
  } catch (error) {
    log.error(`Tokenomics Service error: ${error instanceof Error ? error.message : String(error)}`);
    log.info("Continuing without tokenomics (staking disabled)...");
    tokenomicsService = undefined;
  }

  try {
    x402Service = new X402PaymentService();
    await x402Service.initialize();
    log.success("x402 Payment Service initialized");
  } catch (error) {
    log.error(`x402 Service error: ${error instanceof Error ? error.message : String(error)}`);
    x402Service = new X402PaymentService();
  }

  try {
    agentAuthService = new AgentAuthService();
    await agentAuthService.initialize();
    log.success("Agent Auth Service initialized");
  } catch (error) {
    log.error(`Agent Auth error: ${error instanceof Error ? error.message : String(error)}`);
    agentAuthService = new AgentAuthService();
  }

  try {
    workflowService = new HealthClaimWorkflowService();
    await workflowService.initialize({
      aiService,
      dkgService,
      tokenomicsService
    });
    log.success("Health Claim Workflow Service initialized");
  } catch (error) {
    log.error(`Workflow Service error: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error("Critical: Health Claim Workflow Service failed to initialize");
  }

  await sleep(1000);

  const analyzerIdentity: AgentIdentity = {
    agentId: "analyzer_agent_001",
    name: "Health Analyzer Agent",
    walletAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    privateKey: process.env.BUYER_AGENT_PRIVATE_KEY,
    capabilities: ["health_analysis", "dkg_publishing", "staking"],
    registeredAt: new Date(),
    lastActive: new Date(),
    trustScore: 0.85
  };

  const buyerIdentity: AgentIdentity = {
    agentId: "buyer_agent_002",
    name: "Analysis Buyer Agent",
    walletAddress: process.env.BUYER_AGENT_PUBLIC_KEY || "5FA82F3pSXR76UvTi21w5qsm4naHyzaFH37z13vH1xjFZUsm",
    capabilities: ["payment", "negotiation"],
    registeredAt: new Date(),
    lastActive: new Date(),
    trustScore: 0.75
  };

  log.box("Agent Identities", {
    "Analyzer": analyzerIdentity.name,
    "Analyzer ID": analyzerIdentity.agentId,
    "Buyer": buyerIdentity.name,
    "Buyer ID": buyerIdentity.agentId
  }, "cyan");

  log.info("Checking wallet balances...");
  try {
    const rpcUrl = process.env.DKG_BLOCKCHAIN_RPC || "https://lofar-testnet.origin-trail.network";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const tracAddress = process.env.MEDSY_TRAC_TOKEN_ADDRESS || "0xFfFFFFff00000000000000000000000000000001";
    const tracAbi = ["function balanceOf(address) view returns (uint256)"];
    const tracContract = new ethers.Contract(tracAddress, tracAbi, provider);

    const dkgPublishWallet = process.env.DKG_PUBLISH_WALLET ? new ethers.Wallet(process.env.DKG_PUBLISH_WALLET) : null;
    const buyerWallet = process.env.BUYER_AGENT_PRIVATE_KEY ? new ethers.Wallet(process.env.BUYER_AGENT_PRIVATE_KEY) : null;

    if (dkgPublishWallet) {
      const neuro = await provider.getBalance(dkgPublishWallet.address);
      const trac = await tracContract.balanceOf(dkgPublishWallet.address);
      log.box("DKG_PUBLISH_WALLET Status", {
        "Address": dkgPublishWallet.address,
        "NEURO": `${ethers.formatEther(neuro)} ${parseFloat(ethers.formatEther(neuro)) < 0.01 ? "⚠️ LOW" : "✓"}`,
        "TRAC": `${parseFloat(ethers.formatEther(trac)).toFixed(2)} ${parseFloat(ethers.formatEther(trac)) < 1 ? "⚠️ LOW" : "✓"}`,
        "Role": "Fallback wallet for all operations"
      }, "yellow");
    }

    if (buyerWallet && buyerWallet.address !== dkgPublishWallet?.address) {
      const neuro = await provider.getBalance(buyerWallet.address);
      const trac = await tracContract.balanceOf(buyerWallet.address);
      const willFallback = parseFloat(ethers.formatEther(trac)) < 1;
      log.box("BUYER_AGENT Wallet Status", {
        "Address": buyerWallet.address,
        "NEURO": ethers.formatEther(neuro),
        "TRAC": parseFloat(ethers.formatEther(trac)).toFixed(2),
        "Status": willFallback ? "⟳ Will use DKG_PUBLISH_WALLET" : "✓ Will use own wallet"
      }, willFallback ? "yellow" : "green");
    }
  } catch (error) {
    log.info(`Could not check wallet balances: ${error instanceof Error ? error.message : String(error)}`);
  }

  const analyzerAgent = new AnalyzerAgent(analyzerIdentity, llm, workflowService!);
  const buyerAgent = new BuyerAgent(buyerIdentity, llm, x402Service!, 3.0);
  buyerAgent.setRecipient(analyzerIdentity.walletAddress); // Set payment recipient

  await sleep(500);

  log.subheader("Step 0: Query Guardian Social Graph");
  log.info("Fetching health claims from OriginTrail DKG...");

  let guardianClaim: { claim: string; context: string; postUri?: string; url?: string } | null = null;

  try {
    const guardianResult = await dkgService.findHealthClaimsToFactCheck();

    if (guardianResult.success && guardianResult.posts.length > 0) {
      const post = guardianResult.posts[0];
      guardianClaim = {
        claim: post.headline || post.description || "",
        context: `Guardian Social Graph - ${post.url}`,
        postUri: post.post,
        url: post.url
      };

      log.success(`Found ${guardianResult.posts.length} health claims in Guardian Social Graph`);
      const boxContent: Record<string, any> = {
        "Posts Found": guardianResult.posts.length,
        "Selected Post": post.headline?.substring(0, 60) + "...",
        "Source URL": post.url || "N/A",
        "Description": post.description?.substring(0, 80) + "..." || "N/A",
      };
      log.box("Guardian Social Graph Result", boxContent, "cyan");
    } else {
      log.info(`Guardian query returned: ${guardianResult.error || "no results"}`);
      log.info("Falling back to AI-generated claim...");
    }
  } catch (error) {
    log.error(`Guardian Social Graph query failed: ${error instanceof Error ? error.message : String(error)}`);
    log.info("Falling back to AI-generated claim...");
  }

  await sleep(500);

  log.subheader("Step 1: Select/Generate Health Claim");

  let claim: string;
  let context: string;

  if (guardianClaim) {
    claim = guardianClaim.claim;
    context = guardianClaim.context + (guardianClaim.ual ? ` | UAL: ${guardianClaim.ual}` : "");
    log.success("Using claim from Guardian Social Graph");
  } else {
    const generated = await analyzerAgent.generateClaim();
    claim = generated.claim;
    context = generated.context;
    log.info("Using AI-generated claim (Guardian unavailable)");
  }

  log.box("Health Claim to Analyze", {
    "Claim": claim.length > 90 ? claim.substring(0, 90) + "..." : claim,
    "Context": context,
    "Source": guardianClaim ? "Guardian Social Graph (DKG)" : "AI Generated"
  }, "magenta");

  await sleep(500);

  log.subheader("Step 2: A2A Request - Buyer → Analyzer");
  const requestMsg = buyerAgent.requestAnalysis(analyzerIdentity.agentId, claim, context);
  log.a2a(requestMsg.from, requestMsg.to, "REQUEST", `Analyze: "${claim.substring(0, 90)}..."`);
  log.info(`Message ID: ${requestMsg.messageId}`);

  await sleep(500);

  log.subheader("Step 3: A2A Response - Analyzer Executes Workflow");
  const responseMsg = await analyzerAgent.handleRequest(requestMsg);

  const analysisData = responseMsg.payload.analysis;
  const fullMessage = `Analysis complete: ${analysisData?.verdict || 'unknown'} verdict with ${analysisData?.confidence ? (analysisData.confidence * 100).toFixed(1) : '0'}% confidence. Price: ${responseMsg.payload.price.toFixed(4)} TRAC`;
  log.a2a(responseMsg.from, responseMsg.to, "RESPONSE", fullMessage);

  log.box("Analysis Response", {
    "Claim ID": responseMsg.payload.claimId,
    "Note ID": responseMsg.payload.noteId,
    "UAL": responseMsg.payload.ual || "DKG publishing simulated",
    "Verdict": analysisData?.verdict || "unknown",
    "Confidence": analysisData?.confidence ? `${(analysisData.confidence * 100).toFixed(1)}%` : "0%",
    "Summary": analysisData?.summary?.substring(0, 100) + "..." || "No summary",
    "Price": `${responseMsg.payload.price.toFixed(4)} TRAC`
  }, "blue");

  await sleep(500);

  log.subheader("Step 4: Price Negotiation");
  const priceEval = await buyerAgent.evaluatePrice(responseMsg.payload.price, responseMsg.payload.analysis?.confidence);
  
  if (!priceEval.accept && priceEval.counterOffer) {
    log.a2a(buyerIdentity.agentId, analyzerIdentity.agentId, "PROPOSAL", 
      `Counter-offer: ${log.price(priceEval.counterOffer)} - ${priceEval.reasoning}`);
    
    await sleep(500);

    const proposalMsg = buyerAgent.makeProposal(
      analyzerIdentity.agentId,
      responseMsg.payload.price,
      priceEval.counterOffer
    );
    
    const decisionMsg = await analyzerAgent.handleProposal(proposalMsg);
    log.a2a(decisionMsg.from, decisionMsg.to, decisionMsg.messageType.toUpperCase(), 
      decisionMsg.payload.message);

    if (decisionMsg.messageType === "rejection") {
      log.error("Negotiation failed - Analyzer rejected offer");
      return;
    }

    responseMsg.payload.price = decisionMsg.payload.finalPrice;
    log.success(`Agreement reached at ${log.price(decisionMsg.payload.finalPrice)}`);
  } else {
    log.a2a(buyerIdentity.agentId, analyzerIdentity.agentId, "ACCEPTANCE", 
      `Price accepted: ${log.price(responseMsg.payload.price)}`);
  }

  await sleep(500);

  log.subheader("Step 5: x402 Payment Processing");
  const txHash = await buyerAgent.processPayment(
    responseMsg.payload.price,
    responseMsg.payload.claimId
  );

  let actualTxFrom = buyerIdentity.walletAddress;
  let actualTxTo = analyzerIdentity.walletAddress;
  let actualRecipient = analyzerIdentity.walletAddress;

  try {
    const blockchainProvider = new BlockchainProvider();
    if (!blockchainProvider.getProvider()) {
      await blockchainProvider.initialize();
    }
    const provider = blockchainProvider.getProvider();

    const transaction = await provider.getTransaction(txHash);
    if (transaction) {
      actualTxFrom = transaction.from;
      actualTxTo = transaction.to || actualTxTo;

      if (transaction.data && transaction.data.startsWith('0xa9059cbb')) {
        const recipientAddressBytes = transaction.data.substring(10, 10 + 64);
        if (recipientAddressBytes) {
          const paddedAddress = '0x' + recipientAddressBytes;
          const addressBN = BigInt(paddedAddress);
          actualRecipient = ethers.AddressZero !== `0x${recipientAddressBytes.slice(-40)}` ?
            '0x' + recipientAddressBytes.slice(-40) : actualRecipient;
        }
      }
    }
  } catch (error) {
    log.info(`Could not fetch actual transaction details: ${error instanceof Error ? error.message : String(error)}`);
  }

  log.box("Payment Complete", {
    "Amount": `${responseMsg.payload.price.toFixed(4)} TRAC`,
    "Protocol": "x402 (HTTP 402 Payment Required)",
    "Transaction": txHash,
    "From": actualTxFrom,
    "To (Contract)": actualTxTo,
    "Recipient": actualRecipient,
    "Explorer": `https://neuroweb-testnet.subscan.io/tx/${txHash}`
  }, "green");

  console.log(chalk.gray("\n  View transaction on explorer:"));
  console.log(chalk.blue(`  https://neuroweb-testnet.subscan.io/tx/${txHash}\n`));

  const endTime = Date.now();
  const executionTime = ((endTime - startTime) / 1000).toFixed(2);

  log.header("A2A FLOW COMPLETE");

  log.box("Execution Summary", {
    "Protocol": "Agent-to-Agent (A2A)",
    "Total Time": `${executionTime}s`,
    "Claim Source": guardianClaim ? "Guardian Social Graph" : "AI Generated",
    "Claim": claim,
    "Verdict": analysisData?.verdict || "unknown",
    "Confidence": analysisData?.confidence ? `${(analysisData.confidence * 100).toFixed(1)}%` : "0%",
    "Final Price": `${responseMsg.payload.price.toFixed(4)} TRAC`,
    "Messages Exchanged": "3-5 A2A messages",
    "Transaction Hash": txHash,
    "From Address": actualTxFrom,
    "To Address": actualTxTo,
    "Recipient": actualRecipient,
    "Published UAL": responseMsg.payload.ual || "simulated"
  }, "green");

  if (responseMsg.payload.ual) {
    console.log("\n" + chalk.gray("  View on DKG Explorer:"));
    console.log(chalk.blue(`  https://dkg-testnet.origintrail.io/explore?ual=${encodeURIComponent(responseMsg.payload.ual)}\n`));
  }
}

runA2AFlow().catch((error) => {
  console.error(chalk.red("\n✗ A2A Flow execution failed:"));
  console.error(error);
  process.exit(1);
});
