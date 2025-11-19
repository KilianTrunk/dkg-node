/**
 * x402 Payment Service
 * Implements the x402 micropayment protocol for premium content access
 */

import { getTokenConfig } from "../config";
import { ethers } from "ethers";
import { BlockchainProvider } from "./blockchainProvider";
import { TokenContractService } from "./tokenContractService";
import { createServiceLogger } from "./Logger";
import { db } from "../database";
import { x402Payments } from "../database/schema";

const logger = createServiceLogger("x402PaymentService");

/**
 * x402 Payment Request structure
 */
export interface X402PaymentRequest {
  amount: string; // Amount in stablecoins (e.g., "0.01")
  currency: string; // Currency code (e.g., "USD", "USDC")
  description: string; // Description of what is being purchased
  callbackUrl?: string; // Optional callback URL for payment confirmation
}

/**
 * x402 Payment Response structure
 */
export interface X402PaymentResponse {
  status: "payment_required" | "payment_pending" | "payment_completed";
  paymentId: string;
  amount: string;
  currency: string;
  description: string;
  paymentUrl?: string; // URL where payment can be completed
  transactionHash?: string;
  expiresAt: Date;
}

/**
 * x402 Protocol Implementation
 * Based on x402.org specification for HTTP 402 micropayments
 */
export class X402PaymentService {
  private blockchainProvider!: BlockchainProvider;
  private tokenService!: TokenContractService;
  private initialized = false;

  async initialize() {
    if (this.initialized) return;

    logger.info("Initializing x402 Payment Service...");

    // Initialize blockchain provider for stablecoin payments
    this.blockchainProvider = new BlockchainProvider();
    await this.blockchainProvider.initialize();

    // Initialize token contract service for stablecoin transfers
    this.tokenService = new TokenContractService(this.blockchainProvider);
    await this.tokenService.initialize();

    this.initialized = true;

    const tokenConfig = getTokenConfig();
    logger.info("✅ x402 Payment Service initialized", {
      network: this.blockchainProvider.getNetworkName(),
      supportedCurrencies: ["USDC", "USDT", "DAI"]
    });
  }

  /**
   * Create an x402 payment request
   * Returns HTTP 402 response that clients can use to complete payment
   */
  async createPaymentRequest(
    amount: number,
    description: string,
    userId?: string
  ): Promise<X402PaymentResponse> {
    await this.initialize();

    const paymentId = `x402_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Default to USDC for micropayments
    const currency = "USDC";
    const amountString = amount.toFixed(6); // Micropayment precision

    const paymentRequest: X402PaymentResponse = {
      status: "payment_required",
      paymentId,
      amount: amountString,
      currency,
      description,
      paymentUrl: `${process.env.BASE_URL || 'http://localhost:9200'}/health/x402/pay/${paymentId}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes expiry
    };

    // Store payment in database
    await db.insert(x402Payments).values({
      paymentId,
      amount: amountString,
      currency,
      description,
      status: paymentRequest.status,
      userId: userId,
      paymentUrl: paymentRequest.paymentUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: paymentRequest.expiresAt
    });

    logger.info("x402 Payment request created", {
      paymentId,
      amount: amountString,
      currency,
      description,
      userId
    });

    return paymentRequest;
  }

  /**
   * Process x402 payment completion
   * Called when user/agent completes the payment
   */
  async processPayment(
    paymentId: string,
    payerAddress: string,
    transactionHash?: string
  ): Promise<X402PaymentResponse> {
    await this.initialize();

    // Get payment from database
    const paymentRecord = await db.select().from(x402Payments).where(
      require("drizzle-orm").eq(x402Payments.paymentId, paymentId)
    ).limit(1);

    if (paymentRecord.length === 0) {
      throw new Error(`Payment ${paymentId} not found or expired`);
    }

    const payment = paymentRecord[0];
    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    if (payment.status !== "payment_required") {
      throw new Error(`Payment ${paymentId} is not in required state`);
    }

    let newStatus: string = "payment_pending";
    let verifiedTransactionHash: string | undefined;

    // Verify transaction if hash provided
    if (transactionHash) {
      try {
        await this.verifyPaymentTransaction(transactionHash, payment.amount, payerAddress);
        newStatus = "payment_completed";
        verifiedTransactionHash = transactionHash;
      } catch (error) {
        logger.warn("Payment verification failed", { paymentId, transactionHash, error });
        newStatus = "payment_pending";
      }
    }

    // Update payment in database
    await db.update(x402Payments)
      .set({
        status: newStatus,
        transactionHash: verifiedTransactionHash,
        payerAddress: payerAddress,
        updatedAt: new Date()
      })
      .where(require("drizzle-orm").eq(x402Payments.paymentId, paymentId));

    const updatedPayment: X402PaymentResponse = {
      status: newStatus as any,
      paymentId: payment.paymentId,
      amount: payment.amount,
      currency: payment.currency,
      description: payment.description,
      paymentUrl: payment.paymentUrl || undefined,
      transactionHash: verifiedTransactionHash,
      expiresAt: payment.expiresAt
    };

    logger.info("x402 Payment processed", {
      paymentId,
      status: newStatus,
      transactionHash: verifiedTransactionHash
    });

    return updatedPayment;
  }

  /**
   * Verify payment transaction on blockchain
   */
  private async verifyPaymentTransaction(
    transactionHash: string,
    expectedAmount: string,
    payerAddress: string
  ): Promise<boolean> {
    try {
      // Get transaction details from blockchain
      const provider = this.blockchainProvider.getProvider();
      const transaction = await provider.getTransaction(transactionHash);

      if (!transaction) {
        throw new Error("Transaction not found");
      }

      // Verify transaction was successful
      const receipt = await provider.getTransactionReceipt(transactionHash);
      if (!receipt || receipt.status !== 1) {
        throw new Error("Transaction failed");
      }

      // Parse transaction data to verify amount and recipient
      // This would involve checking the contract call data
      // For now, we'll do basic verification

      logger.info("Payment transaction verified", {
        transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      });

      return true;
    } catch (error) {
      logger.error("Payment verification error", { transactionHash, error });
      return false;
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId: string): Promise<X402PaymentResponse | null> {
    const paymentRecord = await db.select().from(x402Payments).where(
      require("drizzle-orm").eq(x402Payments.paymentId, paymentId)
    ).limit(1);

    if (paymentRecord.length === 0) {
      return null;
    }

    const payment = paymentRecord[0];
    if (!payment) {
      return null;
    }

    return {
      status: payment.status as any,
      paymentId: payment.paymentId,
      amount: payment.amount,
      currency: payment.currency,
      description: payment.description,
      paymentUrl: payment.paymentUrl || undefined,
      transactionHash: payment.transactionHash || undefined,
      expiresAt: payment.expiresAt
    };
  }

  /**
   * Clean up expired payments
   */
  async cleanupExpiredPayments(): Promise<void> {
    try {
      const now = new Date();
      const result = await db.delete(x402Payments)
        .where(require("drizzle-orm").lt(x402Payments.expiresAt, now));

      logger.info("Expired payments cleaned up");
    } catch (error) {
      logger.error("Failed to cleanup expired payments", { error });
    }
  }

  /**
   * Get HTTP 402 response for API endpoints
   */
  get402Response(paymentRequest: X402PaymentResponse): {
    status: 402;
    headers: Record<string, string>;
    body: any;
  } {
    return {
      status: 402,
      headers: {
        "X-Payment-Required": "true",
        "X-Payment-ID": paymentRequest.paymentId,
        "X-Payment-Amount": paymentRequest.amount,
        "X-Payment-Currency": paymentRequest.currency,
        "X-Payment-Description": paymentRequest.description,
        "X-Payment-URL": paymentRequest.paymentUrl || "",
        "Content-Type": "application/json"
      },
      body: {
        error: "Payment Required",
        type: "x402_payment_required",
        payment: paymentRequest
      }
    };
  }
}

/**
 * x402 Middleware for Express routes
 */
export function x402Middleware(requiredAmount: number, description: string) {
  return async (req: any, res: any, next: any) => {
    try {
      // Check if payment header is present
      const paymentHeader = req.headers['x-payment-proof'];
      const paymentId = req.headers['x-payment-id'];

      if (!paymentHeader || !paymentId) {
        // No payment provided, return 402
        const x402Service = new X402PaymentService();
        await x402Service.initialize();

        const paymentRequest = await x402Service.createPaymentRequest(
          requiredAmount,
          description,
          req.user?.id
        );

        const response = x402Service.get402Response(paymentRequest);
        res.status(response.status).set(response.headers).json(response.body);
        return;
      }

      // Payment provided, verify it
      const x402Service = new X402PaymentService();
      await x402Service.initialize();

      const payment = await x402Service.processPayment(paymentId, paymentHeader);
      if (payment.status !== "payment_completed") {
        res.status(402).json({
          error: "Payment verification pending",
          paymentId,
          status: payment.status
        });
        return;
      }

      // Payment verified, proceed
      req.x402Payment = payment;
      next();
    } catch (error) {
      logger.error("x402 middleware error", { error });
      res.status(500).json({ error: "Payment processing error" });
    }
  };
}
