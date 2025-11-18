import { getPaymentConfig, getTokenConfig } from "../config";
import { ethers } from "ethers";
import { BlockchainProvider } from "./blockchainProvider";
import { TokenContractService } from "./tokenContractService";

/**
 * Premium Payment Service
 * Implements TRAC token payments for premium content access (like staking)
 */
export class PaymentService {
  private blockchainProvider!: BlockchainProvider;
  private tokenService!: TokenContractService;
  private initialized = false;

  async initialize() {
    if (this.initialized) return;

    console.log("💰 Initializing Premium Payment Service...");

    // Initialize blockchain provider for TRAC payments (like staking)
    this.blockchainProvider = new BlockchainProvider();
    await this.blockchainProvider.initialize();

    // Initialize token contract service for TRAC transfers
    this.tokenService = new TokenContractService(this.blockchainProvider);
    await this.tokenService.initialize();

    this.initialized = true;

    const tokenConfig = getTokenConfig();
    console.log("✅ Premium Payment Service initialized with config:", {
      tracContract: tokenConfig.TRAC.contractAddress,
      network: this.blockchainProvider.getNetworkName()
    });
  }

  /**
   * Process premium access payment using TRAC tokens (like staking)
   * Transfers TRAC tokens and grants immediate access
   */
  async processPremiumAccess(
    userId: string,
    noteId: string,
    amount: number
  ): Promise<{ transactionHash: string; grantedAt: Date; expiresAt: Date }> {
    await this.initialize();

    const tokenConfig = getTokenConfig();
    if (amount < 0.01) { // Minimum 0.01 TRAC for premium access
      throw new Error(`Payment amount must be at least 0.01 TRAC`);
    }

    if (!this.tokenService.hasTracContract()) {
      throw new Error("TRAC contract not configured - blockchain integration required for premium access");
    }

    console.log("💳 Processing TRAC premium access payment:", {
      userId,
      noteId,
      amount,
      currency: "TRAC"
    });

    try {
      // Get user wallet address (in production, this would be from user auth)
      const userAddress = await this.getUserWalletAddress(userId);
      if (!userAddress) {
        throw new Error(`No wallet address found for user ${userId}`);
      }

      // Check user balance
      const balance = await this.tokenService.getTracBalance(userAddress);
      const requiredAmount = this.tokenService.parseTracAmount(amount.toString());

      if (balance < requiredAmount) {
        throw new Error(`Insufficient TRAC balance. Required: ${this.tokenService.formatTracAmount(requiredAmount)}, Available: ${this.tokenService.formatTracAmount(balance)}`);
      }

      // Generate premium access pool address (like staking pools)
      const premiumPoolAddress = this.generatePremiumPoolAddress(noteId);

      // Transfer TRAC tokens to premium pool
      const tx = await this.tokenService.transferTrac(premiumPoolAddress, requiredAmount);

      // Calculate access period (24 hours from now)
      const grantedAt = new Date();
      const expiresAt = new Date(grantedAt.getTime() + 24 * 60 * 60 * 1000); // 24 hours

      console.log("✅ Premium access payment completed:", {
        userId,
        noteId,
        amount: this.tokenService.formatTracAmount(requiredAmount),
        transactionHash: tx.hash,
        grantedAt,
        expiresAt
      });

      return {
        transactionHash: tx.hash || '',
        grantedAt,
        expiresAt
      };
    } catch (error) {
      console.error("❌ Premium access payment failed:", error);
      throw new Error(`Premium access payment failed: ${error instanceof Error ? error.message : 'Unknown blockchain error'}`);
    }
  }

  /**
   * Request premium access payment (legacy x402 compatibility)
   * Now processes payment immediately like staking
   */
  async requestPremiumAccess(
    userId: string,
    noteId: string,
    amount: number
  ): Promise<{ paymentUrl: string; paymentId: string; paymentHeaders: Record<string, string> }> {
    // Process payment immediately and return success info
    const result = await this.processPremiumAccess(userId, noteId, amount);

    // Return format compatible with existing x402 expectations
    return {
      paymentUrl: `completed:${result.transactionHash}`,
      paymentId: `premium_${Date.now()}`,
      paymentHeaders: {
        'X-Payment-Status': 'completed',
        'X-Transaction-Hash': result.transactionHash,
        'X-Granted-At': result.grantedAt.toISOString(),
        'X-Expires-At': result.expiresAt.toISOString()
      }
    };
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

