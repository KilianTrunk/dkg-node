import { Chain, createPublicClient, createWalletClient, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { PaymentVerification } from "../types/medicalSources";

type Logger = Pick<Console, "log" | "error" | "warn">;

export class X402PaymentService {
  private readonly rpcUrl =
    process.env.NEUROWEB_TESTNET_RPC || "https://rpc-testnet.origin-trail.network";
  private readonly requiredAmount = process.env.X402_PAYMENT_AMOUNT || "0.02";
  private readonly paymentAddress =
    process.env.X402_PAYMENT_ADDRESS || "0x1231231231231231231231231231231231231234";
  private readonly privateKey = process.env.DKG_PUBLISH_WALLET || "";

  private walletClient: ReturnType<typeof createWalletClient> | null = null;
  private publicClient: ReturnType<typeof createPublicClient> | null = null;
  private resolvedPayTo: `0x${string}` | null = null;
  private neurowebChain: Chain | null = null;

  constructor(private readonly logger: Logger = console) {}

  private normalizePayTo(input?: string | null): `0x${string}` | undefined {
    if (!input) return undefined;
    return input.startsWith("0x") ? (input as `0x${string}`) : undefined;
  }

  /**
   * Lazy init provider/signer and derive the payment recipient
   */
  private ensureWallet() {
    if (this.walletClient && this.publicClient && this.resolvedPayTo && this.neurowebChain)
      return;
    if (!this.privateKey) {
      throw new Error("X402 payment wallet not configured (set DKG_PUBLISH_WALLET)");
    }
    this.neurowebChain = {
      id: 20430,
      name: "NeuroWeb Testnet",
      nativeCurrency: { name: "NeuroWeb", symbol: "NEURO", decimals: 18 },
      rpcUrls: { default: { http: [this.rpcUrl] } },
      blockExplorers: {
        default: {
          name: "Subscan",
          url: "https://neuroweb-testnet.subscan.io",
        },
      },
    };
    const account = privateKeyToAccount(this.privateKey as `0x${string}`);
    this.walletClient = createWalletClient({
      account,
      chain: this.neurowebChain,
      transport: http(this.rpcUrl),
    });
    this.publicClient = createPublicClient({
      chain: this.neurowebChain,
      transport: http(this.rpcUrl),
    });
    // Default to the configured address, falling back to the wallet itself so verification works
    this.resolvedPayTo = ((this.paymentAddress as `0x${string}`) || account.address).toLowerCase() as `0x${string}`;
  }

  /**
   * Get payment request details
   */
  getPaymentRequest(overrides?: { payTo?: string; amount?: string }) {
    this.ensureWallet();
    const request = {
      address: this.normalizePayTo(overrides?.payTo) || this.resolvedPayTo!,
      amount: overrides?.amount || this.requiredAmount,
      currency: "NEURO",
      network: "NeuroWeb Testnet",
      chainId: "20430",
      requirement: {
        scheme: "exact",
        network: "neuroweb-testnet",
        resource: "premium-medical-sources",
        description: "Premium medical sources retrieval",
        amount: `${overrides?.amount || this.requiredAmount} NEURO`,
      },
    };

    this.logger.log(`[X402] Payment request`, {
      address: request.address,
      amount: request.amount,
      chainId: request.chainId,
      network: request.network,
    });
    return request;
  }

  async initialize(): Promise<void> {
    // No-op: lazy wallet/provider init happens on first request
    return;
  }

  async requestPremiumAccess(
    userId: string,
    noteId: string,
    amount: number,
  ): Promise<{ paymentUrl: string; paymentId: string; paymentHeaders: Record<string, string> }> {
    this.logger.log("💳 Requesting x402 premium access payment:", {
      userId,
      noteId,
      amount,
      currency: "NEURO",
    });

    const req = this.getPaymentRequest();
    const paymentId = `x402_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const paymentUrl = `${req.network.toLowerCase().includes("neuroweb") ? "https://neuro-scan.io/tx/" : ""}${req.address}`;
    const paymentHeaders = {
      "X-Payment-ID": paymentId,
      "X-Payment-Amount": req.amount,
      "X-Payment-Currency": req.currency,
      "X-Payment-Address": req.address,
      "X-Payment-Network": req.network,
    };

    return { paymentUrl, paymentId, paymentHeaders };
  }

  /**
   * Auto-send required payment using configured wallet
   */
  async sendPayment(overrides?: { payTo?: string; amount?: string }): Promise<{ txHash?: string; error?: string }> {
    try {
      this.ensureWallet();
      const payTo = this.normalizePayTo(overrides?.payTo) || this.resolvedPayTo;
      if (!payTo) {
        return { error: "Payment address not configured" };
      }
      const amount = overrides?.amount || this.requiredAmount;
      const value = parseEther(amount);

      const account = this.walletClient!.account;
      if (!account) {
        return { error: "Payment account not configured" };
      }

      // Preflight balance check
      const [balance, gasPrice] = await Promise.all([
        this.publicClient!.getBalance({ address: account.address }),
        this.publicClient!.getGasPrice(),
      ]);
      const gasLimit = 21_000n;
      const estimatedFee = gasPrice * gasLimit;
      const totalCost = value + estimatedFee;
      if (balance < totalCost) {
        return {
          error: `Insufficient funds: balance ${formatEther(balance)} NEURO, need ~${formatEther(
            totalCost,
          )} NEURO (value ${amount} + fee ${formatEther(estimatedFee)}).`,
        };
      }

      this.logger.log(`[X402] Sending payment ${amount} NEURO to ${payTo}`);
      const txHash = await this.walletClient!.sendTransaction({
        account,
        chain: this.neurowebChain!,
        to: payTo,
        value,
      });
      this.logger.log(`[X402] Waiting for confirmation: ${txHash}`);
      const receipt = await this.publicClient!.waitForTransactionReceipt({ hash: txHash });
      const success = receipt?.status === "success";
      const explorerUrl = `https://neuroweb-testnet.subscan.io/extrinsic/${txHash}`;
      this.logger.log(`[X402] Payment ${success ? "confirmed" : "failed"}: ${txHash}`);
      this.logger.log(`[X402] Explorer: ${explorerUrl}`);
      return success ? { txHash } : { error: "Payment transaction failed" };
    } catch (error) {
      this.logger.error(`[X402] Failed to send payment:`, error as any);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Verify payment on NeuroWeb testnet using the configured RPC provider
   */
  async verifyPayment(txHash: string, overrides?: { payTo?: string; amount?: string }): Promise<PaymentVerification> {
    this.logger.log(`[X402] Verifying transaction: ${txHash}`);
    try {
      this.ensureWallet();
      if (!this.publicClient || !this.resolvedPayTo) {
        throw new Error("Payment provider not initialized");
      }

      const hash = txHash as `0x${string}`;
      const [receipt, tx] = await Promise.all([
        this.publicClient.getTransactionReceipt({ hash }),
        this.publicClient.getTransaction({ hash }),
      ]);

      if (!receipt) {
        this.logger.log(`[X402] ❌ Transaction not found or pending: ${txHash}`);
        return { verified: false, txHash };
      }
      if (!tx) {
        this.logger.log(`[X402] ❌ Could not fetch transaction details`);
        return { verified: false, txHash };
      }

      const txValue = tx.value ?? 0n;
      const payTo = this.normalizePayTo(overrides?.payTo) || this.resolvedPayTo;
      const expectedAmount = overrides?.amount || this.requiredAmount;

      const amountInNeuro = Number(formatEther(txValue));
      const isCorrectRecipient = tx.to?.toLowerCase() === payTo?.toLowerCase();
      const isCorrectAmount = txValue >= parseEther(expectedAmount);
      const isSuccessful = receipt.status === "success";

      const verified = Boolean(isCorrectRecipient && isCorrectAmount && isSuccessful);

      this.logger.log(`[X402] Payment details`, {
        from: tx.from,
        to: tx.to,
        amount: amountInNeuro,
        block: Number(receipt.blockNumber),
        status: isSuccessful ? "success" : "failed",
        verified,
      });

      if (!verified) {
        if (!isCorrectRecipient)
          this.logger.log(`Wrong recipient (expected ${payTo})`);
        if (!isCorrectAmount)
          this.logger.log(`Insufficient amount (expected ${expectedAmount} NEURO)`);
        if (!isSuccessful) this.logger.log(`Transaction failed`);
      }

      return {
        verified,
        txHash,
        amount: `${amountInNeuro} NEURO`,
        from: tx.from,
        blockNumber: Number(receipt.blockNumber),
      };
    } catch (error) {
      this.logger.error(`[X402] Error verifying payment:`, error as any);
      return { verified: false, txHash };
    }
  }

  async grantPremiumAccess(
    userId: string,
    noteId: string,
    paymentId: string,
  ): Promise<{ accessGranted: boolean; expiresAt: Date; transactionHash?: string }> {
    const verification = await this.verifyPayment(paymentId);
    if (!verification.verified) throw new Error("x402 payment verification failed");

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return {
      accessGranted: true,
      expiresAt,
      transactionHash: paymentId,
    };
  }

  /**
   * Pay a 402 requirement and return tx hash
   */
  async settle402(requirement?: { payTo?: string; amount?: string }) {
    const payment = await this.sendPayment({
      payTo: this.normalizePayTo(requirement?.payTo),
      amount: requirement?.amount,
    });
    if (!payment.txHash) return payment;
    const verified = await this.verifyPayment(payment.txHash, {
      payTo: this.normalizePayTo(requirement?.payTo),
      amount: requirement?.amount,
    });
    return verified.verified ? { txHash: payment.txHash } : { error: "Payment not verified" };
  }

  /**
   * Extract 402 requirement headers
   */
  parse402Headers(res: { headers: { get(name: string): string | null } }) {
    const payTo = res.headers.get("x-402-payto") || undefined;
    const amount = res.headers.get("x-402-amount") || undefined;
    const chainId = res.headers.get("x-402-chainid") || undefined;
    return { payTo, amount, chainId };
  }
}
