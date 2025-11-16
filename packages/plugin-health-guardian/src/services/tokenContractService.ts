import { ethers } from "ethers";
import { TOKEN_CONFIG } from "../config";
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

    // Initialize TRAC contract
    if (TOKEN_CONFIG.TRAC.contractAddress && TOKEN_CONFIG.TRAC.contractAddress !== "0x123...") {
      this.tracContract = new ethers.Contract(
        TOKEN_CONFIG.TRAC.contractAddress,
        ERC20_ABI,
        signer
      );
      console.log("🪙 TRAC contract initialized:", TOKEN_CONFIG.TRAC.contractAddress);
    }

    // Initialize NEURO contract
    if (TOKEN_CONFIG.NEURO.contractAddress && TOKEN_CONFIG.NEURO.contractAddress !== "0x456...") {
      this.neuroContract = new ethers.Contract(
        TOKEN_CONFIG.NEURO.contractAddress,
        ERC20_ABI,
        signer
      );
      console.log("🧠 NEURO contract initialized:", TOKEN_CONFIG.NEURO.contractAddress);
    }

    this.initialized = true;
  }

  /**
   * Get TRAC token balance for an address
   */
  async getTracBalance(address: string): Promise<bigint> {
    const contract = this.getTracContract();
    return await contract.balanceOf!(address);
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
   */
  async transferTrac(to: string, amount: bigint): Promise<ethers.TransactionResponse> {
    const contract = this.getTracContract();

    console.log(`💸 Transferring ${ethers.formatUnits(amount, TOKEN_CONFIG.TRAC.decimals)} TRAC to ${to}`);

    const tx = await contract.transfer!(to, amount);
    await tx.wait();

    console.log("✅ TRAC transfer completed:", tx.hash);
    return tx;
  }

  /**
   * Transfer NEURO tokens
   */
  async transferNeuro(to: string, amount: bigint): Promise<ethers.TransactionResponse> {
    const contract = this.getNeuroContract();

    console.log(`💸 Transferring ${ethers.formatUnits(amount, TOKEN_CONFIG.NEURO.decimals)} NEURO to ${to}`);

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
      return TOKEN_CONFIG.TRAC.decimals; // fallback
    }
  }

  async getNeuroDecimals(): Promise<number> {
    try {
      const contract = this.getNeuroContract();
      return await contract.decimals!();
    } catch {
      return TOKEN_CONFIG.NEURO.decimals; // fallback
    }
  }

  /**
   * Format token amount for display
   */
  formatTracAmount(amount: bigint): string {
    return ethers.formatUnits(amount, TOKEN_CONFIG.TRAC.decimals);
  }

  formatNeuroAmount(amount: bigint): string {
    return ethers.formatUnits(amount, TOKEN_CONFIG.NEURO.decimals);
  }

  /**
   * Parse token amount from display format
   */
  parseTracAmount(amount: string): bigint {
    return ethers.parseUnits(amount, TOKEN_CONFIG.TRAC.decimals);
  }

  parseNeuroAmount(amount: string): bigint {
    return ethers.parseUnits(amount, TOKEN_CONFIG.NEURO.decimals);
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
