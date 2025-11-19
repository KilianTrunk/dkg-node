import { getTokenConfig } from "../config";
import type { StakeResult, StakeRequest } from "../types";
import { ethers } from "ethers";
import { BlockchainProvider } from "./blockchainProvider";
import { TokenContractService } from "./tokenContractService";
import { agentRewards, healthClaims, stakes, communityNotes } from "../database/schema";
import { db } from "../database";
import { eq } from "drizzle-orm";

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
      throw new Error("TRAC contract not configured - blockchain integration required for production");
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
      console.error("❌ Token staking failed:", error);
      throw new Error(`Staking failed: ${error instanceof Error ? error.message : 'Unknown blockchain error'}`);
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
   * Calculate and distribute rewards for accurate agent verifications
   * Based on hackathon requirement: reward agents for accurate analysis
   */
  async calculateRewards(noteId: string, finalVerdict: string) {
    console.log(`🏆 Calculating rewards for note ${noteId} with final verdict: ${finalVerdict}`);

    try {
      // Get the original health claim analysis
      const claimAnalysis = await this.getClaimAnalysis(noteId);
      if (!claimAnalysis) {
        console.warn(`No claim analysis found for note ${noteId}`);
        return { totalRewards: 0, individualRewards: [] };
      }

      // Get all stakes on this note
      const stakes = await this.getStakesForNote(noteId);

      // Validate minimum requirements for reward distribution
      if (stakes.length === 0) {
        throw new Error(`No stakes found for note ${noteId} - cannot determine community consensus`);
      }

      const totalStaked = stakes.reduce((sum, stake) => sum + stake.amount, 0);
      if (totalStaked < 10) { // Minimum 10 TRAC staked for meaningful rewards
        throw new Error(`Insufficient staking activity (${totalStaked} TRAC) - minimum 10 TRAC required`);
      }

      // Calculate agent accuracy scores
      const agentScores = this.calculateAgentAccuracyScores(claimAnalysis, finalVerdict, stakes);

      // Calculate reward pool from staking fees (10% of total staked)
      const rewardPool = totalStaked * 0.1; // 10% of staked amount goes to rewards

      // Distribute rewards based on accuracy scores
      const individualRewards = await this.distributeRewards(agentScores, rewardPool, noteId, finalVerdict);

      console.log(`✅ Rewards distributed for note ${noteId}:`, {
        totalPool: rewardPool,
        rewardedAgents: individualRewards.length,
        totalDistributed: individualRewards.reduce((sum, r) => sum + r.amount, 0)
      });

      return {
        totalRewards: rewardPool,
        individualRewards,
        finalVerdict,
        consensusAccuracy: agentScores.length > 0 ? agentScores[0]?.accuracy || 0 : 0
      };
    } catch (error) {
      console.error("Failed to calculate rewards:", error);
      return { totalRewards: 0, individualRewards: [] };
    }
  }

  /**
   * Get claim analysis from database
   */
  private async getClaimAnalysis(noteId: string) {
    try {
      // First, find the community note to get the claimId
      const noteResult = await db
        .select()
        .from(communityNotes)
        .where(eq(communityNotes.noteId, noteId))
        .limit(1);

      if (noteResult.length === 0) {
        throw new Error(`Community note ${noteId} not found`);
      }

      const note = noteResult[0];
      if (!note || !note.claimId) {
        throw new Error(`Community note ${noteId} has no associated claim`);
      }

      const claimId = note.claimId;

      // Then find the health claim analysis
      const claimResult = await db
        .select()
        .from(healthClaims)
        .where(eq(healthClaims.claimId, claimId))
        .limit(1);

      if (claimResult.length === 0) {
        throw new Error(`Health claim ${claimId} not found`);
      }

      const claim = claimResult[0];
      if (!claim) {
        throw new Error(`Invalid claim data for ${claimId}`);
      }

      if (!claim.agentId || !claim.verdict || claim.confidence === null || claim.confidence === undefined) {
        throw new Error(`Incomplete analysis data found for claim ${claimId}`);
      }

      return {
        noteId,
        claimId,
        agentVerdict: claim.verdict,
        confidence: claim.confidence,
        agentId: claim.agentId,
        analysis: claim.analysis ? JSON.parse(claim.analysis as string) : null
      };
    } catch (error) {
      console.error(`Failed to get claim analysis for note ${noteId}:`, error);
      throw new Error(`Unable to retrieve claim analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all stakes for a note
   */
  private async getStakesForNote(noteId: string): Promise<Array<{userId: string, amount: number, position: string}>> {
    try {
      const stakeResults = await db
        .select({
          userId: stakes.userId,
          amount: stakes.amount,
          position: stakes.position
        })
        .from(stakes)
        .where(eq(stakes.noteId, noteId))
        .orderBy(stakes.createdAt);

      return stakeResults;
    } catch (error) {
      console.error(`Failed to get stakes for note ${noteId}:`, error);
      throw new Error(`Unable to retrieve stakes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate accuracy scores for agents based on their verdict vs community consensus
   */
  private calculateAgentAccuracyScores(claimAnalysis: any, finalVerdict: string, stakes: any[]) {
    const agentVerdict = claimAnalysis.agentVerdict;
    const consensusPosition = this.determineConsensusPosition(stakes);

    // Calculate accuracy based on alignment with consensus
    let accuracy = 0;
    if (agentVerdict === consensusPosition) {
      accuracy = 0.9; // High accuracy for matching consensus
    } else if (agentVerdict === finalVerdict) {
      accuracy = 0.8; // Good accuracy for matching final verdict
    } else {
      accuracy = 0.3; // Low accuracy for being wrong
    }

    return [{
      agentId: claimAnalysis.agentId,
      accuracy,
      verdict: agentVerdict,
      confidence: claimAnalysis.confidence
    }];
  }

  /**
   * Determine consensus position from stakes
   */
  private determineConsensusPosition(stakes: Array<{userId: string, amount: number, position: string}>): string {
    const supportTotal = stakes
      .filter(s => s.position === "support")
      .reduce((sum, s) => sum + s.amount, 0);

    const opposeTotal = stakes
      .filter(s => s.position === "oppose")
      .reduce((sum, s) => sum + s.amount, 0);

    return supportTotal > opposeTotal ? "true" : "false";
  }

  /**
   * Distribute rewards to accurate agents
   */
  private async distributeRewards(agentScores: any[], rewardPool: number, noteId: string, finalVerdict: string) {
    const accurateAgents = agentScores.filter(agent => agent.accuracy >= 0.7); // Only reward agents with 70%+ accuracy

    if (accurateAgents.length === 0) {
      console.log("No agents met accuracy threshold for rewards");
      return [];
    }

    // Distribute rewards proportionally based on accuracy
    const totalAccuracy = accurateAgents.reduce((sum, agent) => sum + agent.accuracy, 0);

    const rewards = accurateAgents.map(agent => {
      const rewardAmount = (agent.accuracy / totalAccuracy) * rewardPool;
      return {
        agentId: agent.agentId,
        amount: Math.floor(rewardAmount * 100) / 100, // Round to 2 decimal places
        accuracy: agent.accuracy,
        verdict: agent.verdict,
        reason: `Accurate ${agent.verdict} verdict with ${(agent.accuracy * 100).toFixed(1)}% accuracy`
      };
    });

    // Actually distribute the rewards (transfer TRAC tokens)
    const distributedRewards = [];
    for (const reward of rewards) {
      try {
        // Validate agent has a registered wallet
        const agentAddress = await this.getAgentWalletAddress(reward.agentId);
        if (!agentAddress) {
          console.warn(`Skipping reward for agent ${reward.agentId} - no wallet address registered`);
          continue;
        }

        const tx = await this.distributeRewardToAgent(reward.agentId, reward.amount);

        // Record reward in database
        await db.insert(agentRewards).values({
          agentId: reward.agentId,
          noteId,
          amount: reward.amount,
          accuracy: reward.accuracy,
          verdict: reward.verdict,
          finalVerdict,
          transactionHash: tx.hash || null,
          distributedAt: new Date(),
          reason: reward.reason
        });

        distributedRewards.push({
          ...reward,
          transactionHash: tx.hash || null
        });

        console.log(`💰 Distributed ${reward.amount} TRAC to agent ${reward.agentId} (tx: ${tx.hash || 'pending'})`);
      } catch (error) {
        console.error(`Failed to distribute reward to agent ${reward.agentId}:`, error);
      }
    }

    return distributedRewards;
  }

  /**
   * Distribute TRAC tokens to an agent
   */
  private async distributeRewardToAgent(agentId: string, amount: number) {
    // Get agent wallet address (would be stored in agent registry)
    const agentAddress = await this.getAgentWalletAddress(agentId);

    if (!agentAddress) {
      throw new Error(`No wallet address found for agent ${agentId}`);
    }

    // Transfer TRAC tokens to agent
    const tokenAmount = this.tokenService.parseTracAmount(amount.toString());
    const tx = await this.tokenService.transferTrac(agentAddress, tokenAmount);

    console.log(`✅ Reward transfer completed: ${amount} TRAC to ${agentAddress}, tx: ${tx.hash || 'pending'}`);

    return tx;
  }

  /**
   * Get agent wallet address from agent registry
   */
  private async getAgentWalletAddress(agentId: string): Promise<string | null> {
    try {
      // In production, this would query an agent registry service or database
      // For now, use a hardcoded mapping for known agents
      const agentRegistry: Record<string, string> = {
        "agent_123": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        "agent_456": "0x742d35Cc6634C0532925a3b844Bc454e4438f44f",
        // Add more agents as they register
      };

      const address = agentRegistry[agentId];
      if (!address) {
        console.warn(`Agent ${agentId} not found in registry`);
        return null;
      }

      // Validate address format
      if (!ethers.isAddress(address)) {
        throw new Error(`Invalid wallet address for agent ${agentId}: ${address}`);
      }

      return address;
    } catch (error) {
      console.error(`Failed to get wallet address for agent ${agentId}:`, error);
      return null;
    }
  }

  /**
   * Process premium payment (like staking but for premium access)
   * Transfers TRAC tokens for premium access to enhanced analysis
   */
  async processPremiumPayment(noteId: string, amount: number): Promise<{
    transactionHash: string;
    blockNumber?: number;
    premiumPoolAddress: string;
  }> {
    await this.initialize();

    const userId = "demo_user"; // Mock user ID for now

    if (amount <= 0) {
      throw new Error(`Payment amount must be greater than 0`);
    }

    if (!this.tokenService.hasTracContract()) {
      throw new Error("TRAC contract not configured - blockchain integration required");
    }

    console.log("💎 Processing premium payment:", {
      noteId,
      userId,
      amount,
      currency: "TRAC"
    });

    try {
      // Convert amount to token units
      const paymentAmount = this.tokenService.parseTracAmount(amount.toString());

      // Check user balance
      const signer = this.blockchainProvider.getSigner();
      const userAddress = await signer.getAddress();
      const balance = await this.tokenService.getTracBalance(userAddress);

      if (balance < paymentAmount) {
        throw new Error(`Insufficient TRAC balance. Required: ${this.tokenService.formatTracAmount(paymentAmount)}, Available: ${this.tokenService.formatTracAmount(balance)}`);
      }

      // Generate premium access pool address
      const premiumPoolAddress = this.generatePremiumPoolAddress(noteId);

      // Transfer tokens to premium pool (like staking transfers to staking pool)
      const tx = await this.tokenService.transferTrac(premiumPoolAddress, paymentAmount);

      console.log("✅ Premium payment completed:", {
        transactionHash: tx.hash,
        premiumPoolAddress,
        amount: this.tokenService.formatTracAmount(paymentAmount),
        blockNumber: tx.blockNumber
      });

      return {
        transactionHash: tx.hash,
        blockNumber: tx.blockNumber || undefined,
        premiumPoolAddress
      };

    } catch (error) {
      console.error("❌ Premium payment failed:", error);
      throw new Error(`Premium payment failed: ${error instanceof Error ? error.message : 'Unknown blockchain error'}`);
    }
  }

  /**
   * Generate premium pool address (like staking pools)
   */
  private generatePremiumPoolAddress(noteId: string): string {
    // Generate deterministic address based on note for premium access pool
    const hash = ethers.keccak256(
      ethers.toUtf8Bytes(`${noteId}-premium-access-pool`)
    );
    return ethers.getAddress(ethers.dataSlice(hash, 0, 20));
  }

}
