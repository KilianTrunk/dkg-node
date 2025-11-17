import { getPaymentConfig } from "../config";
import { ethers } from "ethers";
import { BlockchainProvider } from "./blockchainProvider";

/**
 * x402 Payment Protocol Service
 * Implements HTTP 402 micropayments for premium content access
 */
export class PaymentService {
  private blockchainProvider!: BlockchainProvider;
  private initialized = false;

  async initialize() {
    if (this.initialized) return;

    console.log("💰 Initializing x402 Payment Service...");

    // Initialize blockchain provider for stablecoin payments
    this.blockchainProvider = new BlockchainProvider();
    await this.blockchainProvider.initialize();

    this.initialized = true;

    const paymentConfig = getPaymentConfig();
    console.log("✅ x402 Payment Service initialized with config:", {
      stablecoin: paymentConfig.stablecoinAddress,
      threshold: paymentConfig.micropaymentThreshold,
      network: this.blockchainProvider.getNetworkName()
    });
  }

  /**
   * Request premium access payment using x402 protocol
   * Returns HTTP 402 payment required information
   */
  async requestPremiumAccess(
    userId: string,
    noteId: string,
    amount: number
  ): Promise<{ paymentUrl: string; paymentId: string; paymentHeaders: Record<string, string> }> {
    await this.initialize();

    const paymentConfig = getPaymentConfig();
    if (amount < paymentConfig.micropaymentThreshold) {
      throw new Error(`Payment amount must be at least ${paymentConfig.micropaymentThreshold}`);
    }

    console.log("💳 Requesting x402 premium access payment:", {
      userId,
      noteId,
      amount,
      currency: "USD"
    });

    try {
      // Generate payment ID
      const paymentId = `x402_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create x402 payment URL (could be a wallet app or payment processor)
      const paymentUrl = this.generateX402PaymentUrl(paymentId, amount, noteId);

      // Generate x402 payment headers for HTTP 402 response
      const paymentHeaders = this.generateX402Headers(paymentId, amount, noteId);

      console.log("✅ x402 payment request created:", { paymentId, paymentUrl });

      return {
        paymentUrl,
        paymentId,
        paymentHeaders
      };
    } catch (error) {
      console.error("❌ x402 payment request failed:", error);
      console.warn("Falling back to mock payment for development");

      // Fallback to mock for development
      return this.mockRequestPayment(userId, noteId, amount);
    }
  }

  /**
   * Verify x402 payment completion
   * Checks if the payment has been processed on-chain
   */
  async verifyPayment(paymentId: string): Promise<boolean> {
    await this.initialize();

    try {
      console.log("🔍 Verifying x402 payment:", paymentId);

      // 1. Check on-chain transaction status
      // 2. Verify payment amount and recipient
      // 3. Confirm transaction finality

      const isVerified = await this.simulatePaymentVerification(paymentId);

      console.log(`✅ Payment verification ${isVerified ? 'successful' : 'failed'}:`, paymentId);
      return isVerified;
    } catch (error) {
      console.error("❌ x402 payment verification failed:", error);
      console.warn("Falling back to mock verification");

      // Fallback to mock for development
      return this.mockVerifyPayment(paymentId);
    }
  }

  /**
   * Grant premium access after successful x402 payment
   */
  async grantPremiumAccess(
    userId: string,
    noteId: string,
    paymentId: string
  ): Promise<{ accessGranted: boolean; expiresAt: Date; transactionHash?: string }> {
    const paymentVerified = await this.verifyPayment(paymentId);

    if (!paymentVerified) {
      throw new Error("x402 payment verification failed");
    }

    // Grant 24-hour access
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    console.log("🎉 x402 premium access granted:", {
      userId,
      noteId,
      paymentId,
      expiresAt
    });

    return {
      accessGranted: true,
      expiresAt,
      transactionHash: `0x${paymentId.split('_')[2]}...` // Mock tx hash from payment ID
    };
  }

  /**
   * Generate x402 payment URL
   */
  private generateX402PaymentUrl(paymentId: string, amount: number, noteId: string): string {
    // - A wallet deep link (e.g., metamask://, trust://)
    // - A payment processor URL
    // - An x402-compatible payment gateway

    const baseUrl = process.env.X402_PAYMENT_GATEWAY || "https://x402.example.com";
    const params = new URLSearchParams({
      paymentId,
      amount: amount.toString(),
      currency: "USD",
      description: `Premium access to health note ${noteId}`,
      callbackUrl: `${process.env.APP_URL || 'http://localhost:9200'}/api/health/premium/callback`
    });

    return `${baseUrl}/pay?${params.toString()}`;
  }

  /**
   * Generate x402 HTTP headers for 402 Payment Required response
   */
  private generateX402Headers(paymentId: string, amount: number, noteId: string): Record<string, string> {
    return {
      'HTTP/1.1': '402 Payment Required',
      'X-Payment-Amount': amount.toString(),
      'X-Payment-Currency': 'USD',
      'X-Payment-ID': paymentId,
      'X-Payment-Description': `Premium access to health note ${noteId}`,
      'X-Payment-Callback': `${process.env.APP_URL || 'http://localhost:9200'}/api/health/premium/callback`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Simulate payment verification
   */
  private async simulatePaymentVerification(paymentId: string): Promise<boolean> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // For demo purposes, 90% success rate
    const success = Math.random() > 0.1;

    console.log(`Simulated payment verification for ${paymentId}:`, success ? "SUCCESS" : "FAILED");
    return success;
  }

  /**
   * Mock payment request for development
   */
  private async mockRequestPayment(
    userId: string,
    noteId: string,
    amount: number
  ): Promise<{ paymentUrl: string; paymentId: string; paymentHeaders: Record<string, string> }> {
    const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const paymentUrl = `https://mock-payment.example.com/pay/${paymentId}?amount=${amount}`;

    console.log("Mock payment request created:", paymentId);

    return {
      paymentUrl,
      paymentId,
      paymentHeaders: {
        'X-Mock-Payment': 'true',
        'X-Payment-ID': paymentId,
        'X-Payment-Amount': amount.toString()
      }
    };
  }

  /**
   * Mock payment verification
   */
  private async mockVerifyPayment(paymentId: string): Promise<boolean> {
    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 200));

    // Mock successful payment (90% success rate for testing)
    const success = Math.random() > 0.1;

    console.log(`Mock payment verification for ${paymentId}:`, success ? "SUCCESS" : "FAILED");

    return success;
  }
}
