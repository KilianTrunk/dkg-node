import { ethers } from "ethers";
import { getTokenConfig } from "../config";
import { BlockchainProvider } from "./blockchainProvider";

/**
 * ERC20 Token Contract ABI
 */
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

/**
 * Token Contract Service
 * Handles TRAC and NEURO token operations
 */
export class TokenContractService {
  private tracContract: ethers.Contract | null = null;
  private neuroContract: ethers.Contract | null = null;
  private initialized = false;

  constructor(private blockchainProvider: BlockchainProvider) {}

  /**
   * Get TRAC contract with type safety
   */
  private getTracContract(): ethers.Contract {
    if (!this.tracContract) {
      throw new Error("TRAC contract not configured");
    }
    return this.tracContract!;
  }

  /**
   * Get NEURO contract with type safety
   */
  private getNeuroContract(): ethers.Contract {
    if (!this.neuroContract) {
      throw new Error("NEURO contract not configured");
    }
    return this.neuroContract!;
  }

  async initialize() {
    if (this.initialized) return;

    const signer = this.blockchainProvider.getSigner();
    const tokenConfig = getTokenConfig();

    // Initialize TRAC contract
    if (tokenConfig.TRAC.contractAddress && tokenConfig.TRAC.contractAddress !== "0x0000000000000000000000000000000000000000") {
      this.tracContract = new ethers.Contract(
        tokenConfig.TRAC.contractAddress,
        ERC20_ABI,
        signer
      );
      console.log("🪙 TRAC contract initialized:", tokenConfig.TRAC.contractAddress);
    }

    // Initialize NEURO contract
    if (tokenConfig.NEURO.contractAddress && tokenConfig.NEURO.contractAddress !== "0x0000000000000000000000000000000000000000") {
      this.neuroContract = new ethers.Contract(
        tokenConfig.NEURO.contractAddress,
        ERC20_ABI,
        signer
      );
      console.log("🧠 NEURO contract initialized:", tokenConfig.NEURO.contractAddress);
    }

    this.initialized = true;
  }

  /**
   * Get TRAC token balance for an address
   * Handles both ERC-20 and native asset scenarios
   */
  async getTracBalance(address: string): Promise<bigint> {
    const network = await this.blockchainProvider.getProvider().getNetwork();

    // Neuroweb testnet chain ID is 20430, mainnet is 2043
    if (network.chainId === 20430n || network.chainId === 2043n) {
      // On Neuroweb, TRAC is an ERC-20 token, not native
      console.log('🔄 Neuroweb detected: Using ERC-20 TRAC balance');
      const contract = this.getTracContract();
      return await contract.balanceOf!(address);
    } else {
      // Use ERC-20 contract balance for other networks
      const contract = this.getTracContract();
      return await contract.balanceOf!(address);
    }
  }

  /**
   * Get NEURO token balance for an address
   */
  async getNeuroBalance(address: string): Promise<bigint> {
    const contract = this.getNeuroContract();
    return await contract.balanceOf!(address);
  }

  /**
   * Transfer TRAC tokens
   * Uses ERC-20 transfers for Neuroweb (TRAC is ERC-20, not native)
   */
  async transferTrac(to: string, amount: bigint): Promise<ethers.TransactionResponse> {
    const network = await this.blockchainProvider.getProvider().getNetwork();
    const tokenConfig = getTokenConfig();

    console.log(`💸 Transferring ${ethers.formatUnits(amount, tokenConfig.TRAC.decimals)} TRAC to ${to}`);

    // Neuroweb testnet (20430) and mainnet (2043) both use ERC-20 TRAC
    if (network.chainId === 20430n || network.chainId === 2043n) {
      console.log('🔄 Neuroweb detected: Using ERC-20 TRAC transfer');
      const contract = this.getTracContract();
      const signer = this.blockchainProvider.getSigner();
      const tx = await contract.connect(signer).transfer(to, amount);

      await tx.wait();
      console.log("✅ TRAC transfer completed:", tx.hash);
      return tx;
    } else {
      // Use ERC-20 contract transfer for other networks
      const contract = this.getTracContract();
      const signer = this.blockchainProvider.getSigner();
      const tx = await contract.connect(signer).transfer(to, amount);

      await tx.wait();
      console.log("✅ TRAC transfer completed:", tx.hash);
      return tx;
    }
  }

  /**
   * Transfer NEURO tokens
   */
  async transferNeuro(to: string, amount: bigint): Promise<ethers.TransactionResponse> {
    const contract = this.getNeuroContract();

    const tokenConfig = getTokenConfig();
    console.log(`💸 Transferring ${ethers.formatUnits(amount, tokenConfig.NEURO.decimals)} NEURO to ${to}`);

    const tx = await contract.transfer!(to, amount);
    await tx.wait();

    console.log("✅ NEURO transfer completed:", tx.hash);
    return tx;
  }

  /**
   * Get token decimals
   */
  async getTracDecimals(): Promise<number> {
    try {
      const contract = this.getTracContract();
      return await contract.decimals!();
    } catch {
      const tokenConfig = getTokenConfig();
      return tokenConfig.TRAC.decimals; // fallback
    }
  }

  async getNeuroDecimals(): Promise<number> {
    try {
      const contract = this.getNeuroContract();
      return await contract.decimals!();
    } catch {
      const tokenConfig = getTokenConfig();
      return tokenConfig.NEURO.decimals; // fallback
    }
  }

  /**
   * Format token amount for display
   */
  formatTracAmount(amount: bigint): string {
    const tokenConfig = getTokenConfig();
    return ethers.formatUnits(amount, tokenConfig.TRAC.decimals);
  }

  formatNeuroAmount(amount: bigint): string {
    const tokenConfig = getTokenConfig();
    return ethers.formatUnits(amount, tokenConfig.NEURO.decimals);
  }

  /**
   * Parse token amount from display format
   */
  parseTracAmount(amount: string): bigint {
    const tokenConfig = getTokenConfig();
    return ethers.parseUnits(amount, tokenConfig.TRAC.decimals);
  }

  parseNeuroAmount(amount: string): bigint {
    const tokenConfig = getTokenConfig();
    return ethers.parseUnits(amount, tokenConfig.NEURO.decimals);
  }

  /**
   * Check if contracts are available
   */
  hasTracContract(): boolean {
    return this.tracContract !== null;
  }

  hasNeuroContract(): boolean {
    return this.neuroContract !== null;
  }
}
