// DKG Edge Node Configuration - matches agent setup
export const DKG_CONFIG = {
  endpoint: process.env.DKG_OTNODE_URL || "https://astrosat-parachain-rpc.origin-trail.network",
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
  // TODO: Replace with real token contract addresses
  TRAC: {
    contractAddress: "0x123...", // OriginTrail TRAC token
    decimals: 18
  },
  NEURO: {
    contractAddress: "0x456...", // NeuroWeb NEURO token
    decimals: 18
  },
  staking: {
    minimumStake: 1, // Minimum TRAC tokens to stake
    rewardMultiplier: 1.5, // Reward multiplier for correct verifications
    // TODO: Add staking contract integration
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
  // TODO: Replace with real x402 implementation
  stablecoinAddress: "0x789...", // USDC or other stablecoin
  paymentGateway: "https://x402.example.com",
  micropaymentThreshold: 0.01, // Minimum payment in USD
  // TODO: Add x402 protocol integration
};
