import { getTokenConfig } from "../config";
import type { StakeResult, StakeRequest } from "../types";
import { ethers } from "ethers";
import { BlockchainProvider } from "./blockchainProvider";
import { TokenContractService } from "./tokenContractService";

/**
 * Tokenomics Service for TRAC/NEURO token staking
 * Handles real blockchain token operations
 */
export class TokenomicsService {
  private blockchainProvider!: BlockchainProvider;
  private tokenService!: TokenContractService;
  private initialized = false;

  async initialize() {
    if (this.initialized) return;

    console.log("🔗 Initializing Tokenomics Service...");

    // Initialize blockchain provider
    this.blockchainProvider = new BlockchainProvider();
    await this.blockchainProvider.initialize();

    // Initialize token contract service
    this.tokenService = new TokenContractService(this.blockchainProvider);
    await this.tokenService.initialize();

    this.initialized = true;

    const tokenConfig = getTokenConfig();
    console.log("✅ Tokenomics Service initialized with config:", {
      tracContract: tokenConfig.TRAC.contractAddress,
      neuroContract: tokenConfig.NEURO.contractAddress,
      minimumStake: tokenConfig.staking.minimumStake,
      network: this.blockchainProvider.getNetworkName()
    });
  }

  /**
   * Stake TRAC tokens on a health note
   * Creates a real token transfer to a staking pool
   */
  async stakeTokens(request: StakeRequest): Promise<StakeResult> {
    await this.initialize();

    const { noteId, amount, position, reasoning } = request;
    const userId = "demo_user"; // Mock user ID for now

    const tokenConfig = getTokenConfig();
    if (amount < tokenConfig.staking.minimumStake) {
      throw new Error(`Minimum stake is ${tokenConfig.staking.minimumStake} TRAC tokens`);
    }

    if (!this.tokenService.hasTracContract()) {
      console.warn("TRAC contract not configured, falling back to mock staking");
      return this.mockStake(noteId, userId, amount, position, reasoning);
    }

    console.log("🏛️ Staking tokens:", {
      noteId,
      userId,
      amount,
      position,
      reasoning: reasoning?.substring(0, 100)
    });

    try {
      // Convert amount to token units
      const stakeAmount = this.tokenService.parseTracAmount(amount.toString());

      // Check user balance
      const signer = this.blockchainProvider.getSigner();
      const userAddress = await signer.getAddress();
      const balance = await this.tokenService.getTracBalance(userAddress);

      if (balance < stakeAmount) {
        throw new Error(`Insufficient TRAC balance. Required: ${this.tokenService.formatTracAmount(stakeAmount)}, Available: ${this.tokenService.formatTracAmount(balance)}`);
      }

      // Generate staking pool address (for now, use a mock pool)
      // TODO: Replace with real staking contract address
      const stakingPoolAddress = this.generateStakingPoolAddress(noteId, position);

      // Transfer tokens to staking pool
      const tx = await this.tokenService.transferTrac(stakingPoolAddress, stakeAmount);

      // Generate stake ID
      const stakeId = `stake_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log("✅ Token staking completed:", {
        stakeId,
        txHash: tx.hash,
        amount: this.tokenService.formatTracAmount(stakeAmount),
        pool: stakingPoolAddress
      });

      return {
        stakeId,
        communityConsensus: await this.getCommunityConsensus(noteId),
        transactionHash: tx.hash
      };
    } catch (error) {
      console.error("❌ Real token staking failed:", error);
      console.warn("Falling back to mock staking for development");

      // Fallback to mock for development
      return this.mockStake(noteId, userId, amount, position, reasoning);
    }
  }

  /**
   * Get community consensus for a note
   */
  async getCommunityConsensus(noteId: string): Promise<{ support: number; oppose: number }> {
    await this.initialize();
    // TODO: Replace with on-chain staking contract queries when available
    try {
      return { support: 0, oppose: 0 };
    } catch (error) {
      console.warn("Consensus query failed:", error);
      return { support: 0, oppose: 0 };
    }
  }

  /**
   * Generate a staking pool address for a note and position
   * TODO: Replace with real staking contract addresses
   */
  private generateStakingPoolAddress(noteId: string, position: "support" | "oppose"): string {
    // For development, generate deterministic addresses based on note and position
    // In production, this would be a real staking contract
    const hash = ethers.keccak256(
      ethers.toUtf8Bytes(`${noteId}-${position}-staking-pool`)
    );
    return ethers.getAddress(ethers.dataSlice(hash, 0, 20));
  }

  /**
   * Check if user has sufficient token balance
   */
  async checkTokenBalance(userId: string, token: "TRAC" | "NEURO", amount: number): Promise<boolean> {
    await this.initialize();

    try {
      const signer = this.blockchainProvider.getSigner();
      const userAddress = await signer.getAddress();

      let balance: bigint;
      if (token === "TRAC") {
        if (!this.tokenService.hasTracContract()) return false;
        balance = await this.tokenService.getTracBalance(userAddress);
        amount = parseFloat(this.tokenService.parseTracAmount(amount.toString()).toString());
      } else {
        if (!this.tokenService.hasNeuroContract()) return false;
        balance = await this.tokenService.getNeuroBalance(userAddress);
        amount = parseFloat(this.tokenService.parseNeuroAmount(amount.toString()).toString());
      }

      return balance >= BigInt(amount);
    } catch (error) {
      console.error("Balance check failed:", error);
      return false;
    }
  }

  /**
   * Calculate rewards for accurate verifications
   * TODO: Implement reward distribution logic
   */
  async calculateRewards(noteId: string, finalVerdict: string) {
    // TODO: Implement reward calculation and distribution
    console.log("Calculating rewards for note:", noteId, "with verdict:", finalVerdict);
    return {
      totalRewards: 0,
      individualRewards: []
    };
  }

  /**
   * Mock staking for development
   * TODO: Remove when real token integration is complete
   */
  private async mockStake(
    noteId: string,
    userId: string,
    amount: number,
    position: "support" | "oppose",
    reasoning?: string
  ): Promise<StakeResult> {
    // Simulate blockchain transaction delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const stakeId = `stake_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log("Mock token staking successful:", stakeId);

    // Mock consensus
    const consensus = await this.getCommunityConsensus(noteId);

    return {
      stakeId,
      communityConsensus: {
        support: position === "support" ? consensus.support + amount : consensus.support,
        oppose: position === "oppose" ? consensus.oppose + amount : consensus.oppose
      }
    };
  }

}
