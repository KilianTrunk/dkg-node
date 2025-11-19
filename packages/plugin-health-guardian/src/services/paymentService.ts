import { getPaymentConfig, getTokenConfig } from "../config";
import { ethers } from "ethers";
import { BlockchainProvider } from "./blockchainProvider";
import { TokenContractService } from "./tokenContractService";
import { X402PaymentService, X402PaymentRequest, X402PaymentResponse } from "./x402PaymentService";

/**
 * Premium Payment Service
 * Implements x402 micropayment protocol for premium content access
 */
export class PaymentService {
  private blockchainProvider!: BlockchainProvider;
  private tokenService!: TokenContractService;
  private x402Service!: X402PaymentService;
  private initialized = false;

  async initialize() {
    if (this.initialized) return;

    console.log("💰 Initializing Premium Payment Service with x402...");

    // Initialize blockchain provider for stablecoin payments
    this.blockchainProvider = new BlockchainProvider();
    await this.blockchainProvider.initialize();

    // Initialize token contract service for stablecoin transfers
    this.tokenService = new TokenContractService(this.blockchainProvider);
    await this.tokenService.initialize();

    // Initialize x402 payment service
    this.x402Service = new X402PaymentService();
    await this.x402Service.initialize();

    this.initialized = true;

    const tokenConfig = getTokenConfig();
    console.log("✅ Premium Payment Service initialized with x402:", {
      network: this.blockchainProvider.getNetworkName(),
      x402Enabled: true,
      supportedCurrencies: ["USDC", "USDT", "DAI"]
    });
  }

  /**
   * Create x402 payment request for premium access
   * Returns payment details that client can use to complete micropayment
   */
  async requestPremiumAccess(
    userId: string,
    noteId: string,
    amount: number = 0.01
  ): Promise<X402PaymentResponse> {
    await this.initialize();

    if (amount < 0.01) {
      throw new Error(`Payment amount must be at least 0.01 USD`);
    }

    console.log("💰 Creating x402 payment request:", {
      userId,
      noteId,
      amount,
      currency: "USD"
    });

    const description = `Premium access to enhanced health analysis with medical citations for note ${noteId}`;

    try {
      const paymentRequest = await this.x402Service.createPaymentRequest(
        amount,
        description,
        userId
      );

      console.log("✅ x402 Payment request created:", {
        paymentId: paymentRequest.paymentId,
        amount: paymentRequest.amount,
        currency: paymentRequest.currency
      });

      return paymentRequest;
    } catch (error) {
      console.error("❌ x402 payment request failed:", error);
      throw new Error(`x402 payment request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process completed x402 payment for premium access
   * Called after payment is completed via x402 protocol
   */
  async processPremiumAccess(
    paymentId: string,
    payerAddress: string,
    transactionHash?: string
  ): Promise<{ transactionHash: string; grantedAt: Date; expiresAt: Date }> {
    await this.initialize();

    console.log("💰 Processing x402 premium access payment:", {
      paymentId,
      payerAddress,
      transactionHash
    });

    try {
      const payment = await this.x402Service.processPayment(paymentId, payerAddress, transactionHash);

      if (payment.status !== "payment_completed") {
        throw new Error(`Payment not completed. Status: ${payment.status}`);
      }

      console.log("✅ x402 Premium access payment completed:", {
        paymentId,
        transactionHash: payment.transactionHash,
        amount: payment.amount,
        currency: payment.currency
      });

      // Calculate access period (30 days from now)
      const grantedAt = new Date();
      const expiresAt = new Date(grantedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

      return {
        transactionHash: payment.transactionHash!,
        grantedAt,
        expiresAt
      };
    } catch (error) {
      console.error("❌ x402 premium access payment failed:", error);
      throw new Error(`x402 premium access payment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  /**
   * Get user wallet address (production implementation)
   */
  private async getUserWalletAddress(userId: string): Promise<string | null> {
    try {
      // In production, this would query user registry or auth system
      // For now, use a hardcoded mapping for demo users
      const userRegistry: Record<string, string> = {
        "demo_user": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", // Same as agent for demo
        "user_123": "0x742d35Cc6634C0532925a3b844Bc454e4438f44f",
        // Add more users as they register
      };

      const address = userRegistry[userId];
      if (!address) {
        console.warn(`User ${userId} not found in registry`);
        return null;
      }

      // Validate address format
      if (!ethers.isAddress(address)) {
        throw new Error(`Invalid wallet address for user ${userId}: ${address}`);
      }

      return address;
    } catch (error) {
      console.error(`Failed to get wallet address for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Generate premium access pool address (like staking pools)
   */
  private generatePremiumPoolAddress(noteId: string): string {
    // Generate deterministic address based on note for premium access pool
    const hash = ethers.keccak256(
      ethers.toUtf8Bytes(`${noteId}-premium-access-pool`)
    );
    return ethers.getAddress(ethers.dataSlice(hash, 0, 20));
  }

}

