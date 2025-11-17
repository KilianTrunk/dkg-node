import { z } from "zod";

/**
 * Health Guardian Plugin Configuration
 * Following the pattern from plugin-dkg-publisher for consistency
 */

export const HealthGuardianConfigSchema = z.object({
  database: z.object({
    path: z.string().default("./health-guardian.db"),
  }),
  ai: z.object({
    provider: z.enum(["openai", "anthropic", "groq", "mistral"]).default("openai"),
    model: z.string().optional(),
    temperature: z.number().min(0).max(1).default(0.7),
    maxTokens: z.number().positive().default(4000),
  }).optional(),
  dkg: z.object({
    endpoint: z.string().optional(),
    blockchain: z.string().optional(),
    epochsNum: z.number().positive().default(5),
    minimumNumberOfFinalizationConfirmations: z.number().positive().default(1),
    minimumNumberOfNodeReplications: z.number().positive().default(1),
  }).optional(),
  tokenomics: z.object({
    tracTokenAddress: z.string().optional(),
    rewardMultiplier: z.number().positive().default(1.0),
  }).optional(),
  payment: z.object({
    enabled: z.boolean().default(false),
    stablecoinAddress: z.string().optional(),
  }).optional(),
  logging: z.object({
    level: z.enum(["error", "warn", "info", "debug"]).default("info"),
    enableFileLogging: z.boolean().default(true),
  }).optional(),
});

export type HealthGuardianConfig = z.infer<typeof HealthGuardianConfigSchema>;

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: HealthGuardianConfig = {
  database: {
    path: "./health-guardian.db",
  },
  ai: {
    provider: "openai",
    temperature: 0.7,
    maxTokens: 4000,
  },
  dkg: {
    epochsNum: 5,
    minimumNumberOfFinalizationConfirmations: 1,
    minimumNumberOfNodeReplications: 1,
  },
  tokenomics: {
    rewardMultiplier: 1.0,
  },
  payment: {
    enabled: false,
  },
  logging: {
    level: "info",
    enableFileLogging: true,
  },
};

/**
 * Load configuration from environment variables
 */
export function loadConfig(): HealthGuardianConfig {
  const config: Partial<HealthGuardianConfig> = { ...DEFAULT_CONFIG };

  // Database configuration
  if (process.env.HG_DATABASE_PATH) {
    config.database = { path: process.env.HG_DATABASE_PATH };
  }

  // AI configuration
  if (process.env.HG_AI_PROVIDER) {
    config.ai = {
      provider: process.env.HG_AI_PROVIDER as any,
      temperature: config.ai?.temperature ?? DEFAULT_CONFIG.ai!.temperature,
      maxTokens: config.ai?.maxTokens ?? DEFAULT_CONFIG.ai!.maxTokens,
      model: process.env.HG_AI_MODEL ?? config.ai?.model,
    };
  }
  if (process.env.HG_AI_MODEL && config.ai) {
    config.ai.model = process.env.HG_AI_MODEL;
  }
  if (process.env.HG_AI_TEMPERATURE && config.ai) {
    config.ai.temperature = parseFloat(process.env.HG_AI_TEMPERATURE);
  }
  if (process.env.HG_AI_MAX_TOKENS && config.ai) {
    config.ai.maxTokens = parseInt(process.env.HG_AI_MAX_TOKENS);
  }

  // DKG configuration
  if (process.env.HG_DKG_ENDPOINT) {
    config.dkg = {
      endpoint: process.env.HG_DKG_ENDPOINT,
      blockchain: config.dkg?.blockchain ?? DEFAULT_CONFIG.dkg!.blockchain,
      epochsNum: config.dkg?.epochsNum ?? DEFAULT_CONFIG.dkg!.epochsNum,
      minimumNumberOfFinalizationConfirmations: config.dkg?.minimumNumberOfFinalizationConfirmations ?? DEFAULT_CONFIG.dkg!.minimumNumberOfFinalizationConfirmations,
      minimumNumberOfNodeReplications: config.dkg?.minimumNumberOfNodeReplications ?? DEFAULT_CONFIG.dkg!.minimumNumberOfNodeReplications,
    };
  }
  if (process.env.HG_DKG_BLOCKCHAIN && config.dkg) {
    config.dkg.blockchain = process.env.HG_DKG_BLOCKCHAIN;
  }

  // Tokenomics configuration
  if (process.env.HG_TRAC_TOKEN_ADDRESS) {
    config.tokenomics = {
      tracTokenAddress: process.env.HG_TRAC_TOKEN_ADDRESS,
      rewardMultiplier: config.tokenomics?.rewardMultiplier ?? DEFAULT_CONFIG.tokenomics!.rewardMultiplier,
    };
  }

  // Payment configuration
  if (process.env.HG_PAYMENT_ENABLED) {
    config.payment = {
      enabled: process.env.HG_PAYMENT_ENABLED === "true",
      stablecoinAddress: config.payment?.stablecoinAddress,
    };
  }

  // Logging configuration
  if (process.env.LOG_LEVEL) {
    config.logging = {
      level: process.env.LOG_LEVEL as any,
      enableFileLogging: config.logging?.enableFileLogging ?? DEFAULT_CONFIG.logging!.enableFileLogging,
    };
  }

  // Validate configuration
  const validatedConfig = HealthGuardianConfigSchema.parse(config);

  return validatedConfig;
}

/**
 * Legacy config exports for backward compatibility
 * These will be removed in a future version once all services are updated
 */
export const DKG_CONFIG = {
  blockchain: {
    name: process.env.HG_DKG_BLOCKCHAIN || "otp"
  },
  publishing: {
    epochsNum: parseInt(process.env.HG_DKG_EPOCHS_NUM || "5"),
    minimumNumberOfFinalizationConfirmations: parseInt(process.env.HG_DKG_MIN_CONFIRMATIONS || "1"),
    minimumNumberOfNodeReplications: parseInt(process.env.HG_DKG_MIN_REPLICATIONS || "1"),
  }
};

/**
 * Dynamic TOKEN_CONFIG - loads values at runtime after env vars are set
 */
export function getTokenConfig() {
  return {
    TRAC: {
      contractAddress: process.env.HG_TRAC_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000",
      decimals: 18 // TRAC uses 18 decimals like most ERC20 tokens
    },
    NEURO: {
      contractAddress: process.env.HG_NEURO_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000",
      decimals: 18 // NEURO uses 18 decimals like most ERC20 tokens
    },
    staking: {
      minimumStake: parseFloat(process.env.HG_MINIMUM_STAKE || "1.0")
    },
    rewardMultiplier: parseFloat(process.env.HG_REWARD_MULTIPLIER || "1.0")
  };
}

/**
 * Dynamic PAYMENT_CONFIG - loads values at runtime after env vars are set
 */
export function getPaymentConfig() {
  return {
    enabled: process.env.HG_PAYMENT_ENABLED === "true",
    stablecoinAddress: process.env.HG_STABLECOIN_ADDRESS,
    micropaymentThreshold: parseFloat(process.env.HG_MICROPAYMENT_THRESHOLD || "0.01")
  };
}

// Legacy exports for backward compatibility (will be updated to use dynamic versions)
export const TOKEN_CONFIG = getTokenConfig();
export const PAYMENT_CONFIG = getPaymentConfig();