import { ethers } from "ethers";

/**
 * Blockchain Provider Service
 * Handles blockchain connections and wallet management
 */
export class BlockchainProvider {
  private provider: ethers.JsonRpcProvider | null = null;
  private signer: ethers.Signer | null = null;
  private network: ethers.Network | null = null;

  async initialize() {
    const rpcUrl = process.env.DKG_BLOCKCHAIN_RPC || "https://astrosat-parachain-rpc.origin-trail.network";
    const privateKey = process.env.DKG_PUBLISH_WALLET;

    if (!privateKey) {
      throw new Error("DKG_PUBLISH_WALLET environment variable is required for token operations");
    }

    console.log("🌐 Connecting to blockchain:", rpcUrl);

    // Create provider
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    // Create wallet from private key
    const wallet = new ethers.Wallet(privateKey, this.provider);
    this.signer = wallet;

    // Get network info
    this.network = await this.provider.getNetwork();

    console.log("✅ Connected to network:", this.getNetworkName(), "Chain ID:", this.network.chainId);
  }

  getProvider(): ethers.JsonRpcProvider {
    if (!this.provider) {
      throw new Error("Blockchain provider not initialized");
    }
    return this.provider;
  }

  getSigner(): ethers.Signer {
    if (!this.signer) {
      throw new Error("Signer not initialized");
    }
    return this.signer;
  }

  getNetworkName(): string {
    if (!this.network) return "unknown";
    return this.network.name || `chain-${this.network.chainId}`;
  }

  async getBalance(address: string): Promise<bigint> {
    return await this.getProvider().getBalance(address);
  }

  async estimateGas(tx: ethers.TransactionRequest): Promise<bigint> {
    return await this.getProvider().estimateGas(tx);
  }
}
