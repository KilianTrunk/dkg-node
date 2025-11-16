// DKG Edge Node Configuration - matches agent setup
export const DKG_CONFIG = {
  endpoint: process.env.DKG_OTNODE_URL || "http://localhost:8900",
  blockchain: {
    name: process.env.DKG_BLOCKCHAIN || "otp:20430", // OriginTrail Parachain Testnet
    rpcEndpoints: [
      "https://astrosat-parachain-rpc.origin-trail.network",
      // Add more RPC endpoints for redundancy
    ]
  },
  wallet: {
    privateKey: process.env.DKG_PUBLISH_WALLET,
  },
  publishing: {
    epochsNum: 2,
    minimumNumberOfFinalizationConfirmations: 3,
    minimumNumberOfNodeReplications: 1,
  }
};

// Tokenomics Configuration
export const TOKEN_CONFIG = {
  // TRAC token on OriginTrail testnet
  TRAC: {
    contractAddress: process.env.TRAC_CONTRACT_ADDRESS || "0xE97FDca0A3fc6383aFd6aD1F707b8E7d8f49C002", // Example testnet address
    decimals: 18
  },
  // NEURO token on NeuroWeb
  NEURO: {
    contractAddress: process.env.NEURO_CONTRACT_ADDRESS || "0x47b9a1409aE7F5C4e2C9bD7e2B8c6F4E8F3A9D2C", // Example address
    decimals: 18
  },
  staking: {
    minimumStake: 1, // Minimum TRAC tokens to stake
    rewardMultiplier: 1.5, // Reward multiplier for correct verifications
    // Staking pool contract (to be deployed)
    stakingContractAddress: process.env.STAKING_CONTRACT_ADDRESS
  }
};

// AI Configuration - uses agent's configured LLM (Groq with GPT-OSS-120B)
export const AI_CONFIG = {
  // Uses agent's LLM_PROVIDER, LLM_MODEL, LLM_TEMPERATURE environment variables
  fallbackProvider: "mock", // Fallback if agent LLM unavailable
  // Analysis parameters
  temperature: 0.1, // Low temperature for factual analysis
  maxTokens: 1000,
};

// x402 Payment Configuration
export const PAYMENT_CONFIG = {
  // USDC stablecoin on OriginTrail testnet
  stablecoinAddress: process.env.STABLECOIN_CONTRACT_ADDRESS || "0xA0b86a33E6441e88C5F2712C3E9b74F5b6c6C6b7", // Example USDC address
  paymentGateway: process.env.X402_PAYMENT_GATEWAY || "https://x402.origintrail.network",
  micropaymentThreshold: 0.01, // Minimum payment in USD
  // x402 protocol settings
  paymentTimeoutMinutes: 30, // Payment validity timeout
  callbackUrl: process.env.X402_CALLBACK_URL || "/api/health/premium/callback"
};
