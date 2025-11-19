import type { WorkflowProgress } from "../types";

/**
 * Workflow configuration for timeouts and optimization
 */
export class WorkflowConfig {
  static readonly timeouts = {
    aiAnalysis: 60000, // 60 seconds for AI analysis
    dkgPublish: 0, // No timeout for DKG publishing - critical operation cannot be interrupted
    tokenStake: 60000, // 60 seconds for token staking
    totalWorkflow: 240000, // 4 minutes total timeout
  };

  static readonly caching = {
    enabled: true,
    ttl: 3600000, // 1 hour cache TTL
  };

  static readonly progressReporting = {
    enabled: true,
    interval: 5000, // Report progress every 5 seconds
  };

  // Performance optimization modes
  static readonly performanceMode = process.env.MEDSY_PERFORMANCE_MODE || 'balanced';

  static readonly fastMode = {
    // Reduce timeouts for faster processing (but less reliable)
    timeouts: {
      aiAnalysis: 30000, // 30 seconds
      dkgPublish: 0, // No timeout for DKG publishing - critical operation cannot be interrupted
      tokenStake: 30000, // 30 seconds
      totalWorkflow: 150000, // 2.5 minutes total
    },
    // Skip some operations in fast mode
    skipStaking: false,
    skipDetailedLogging: false,
  };

  // Environment variable controlled timeouts for production tuning
  static readonly customTimeouts = {
    aiAnalysis: process.env.MEDSY_TIMEOUT_AI_ANALYSIS ? parseInt(process.env.MEDSY_TIMEOUT_AI_ANALYSIS) : null,
    dkgPublish: process.env.MEDSY_TIMEOUT_DKG_PUBLISH ? parseInt(process.env.MEDSY_TIMEOUT_DKG_PUBLISH) : null,
    tokenStake: process.env.MEDSY_TIMEOUT_TOKEN_STAKE ? parseInt(process.env.MEDSY_TIMEOUT_TOKEN_STAKE) : null,
    totalWorkflow: process.env.MEDSY_TIMEOUT_TOTAL_WORKFLOW ? parseInt(process.env.MEDSY_TIMEOUT_TOTAL_WORKFLOW) : null,
  };

  /**
   * Get effective timeouts based on performance mode and environment variables
   */
  static getEffectiveTimeouts() {
    let baseTimeouts = WorkflowConfig.timeouts;

    // Apply performance mode overrides
    const isFastMode = WorkflowConfig.performanceMode === 'fast';
    if (isFastMode) {
      baseTimeouts = {
        ...WorkflowConfig.timeouts,
        ...WorkflowConfig.fastMode.timeouts
      };
    }

    // Apply environment variable overrides
    const customTimeouts = WorkflowConfig.customTimeouts;
    const effectiveTimeouts = { ...baseTimeouts };

    if (customTimeouts.aiAnalysis !== null && customTimeouts.aiAnalysis !== undefined) {
      effectiveTimeouts.aiAnalysis = customTimeouts.aiAnalysis;
    }
    if (customTimeouts.dkgPublish !== null && customTimeouts.dkgPublish !== undefined) {
      effectiveTimeouts.dkgPublish = customTimeouts.dkgPublish;
    }
    if (customTimeouts.tokenStake !== null && customTimeouts.tokenStake !== undefined) {
      effectiveTimeouts.tokenStake = customTimeouts.tokenStake;
    }
    if (customTimeouts.totalWorkflow !== null && customTimeouts.totalWorkflow !== undefined) {
      effectiveTimeouts.totalWorkflow = customTimeouts.totalWorkflow;
    }

    return effectiveTimeouts;
  }

  /**
   * Execute operation with timeout (or without if timeoutMs is 0)
   */
  static async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<T> {
    // If timeout is 0, execute without timeout (for critical operations like DKG publishing)
    if (timeoutMs === 0) {
      return operation;
    }

    const effectiveTimeout = WorkflowConfig.getEffectiveTimeouts();
    const actualTimeout = Math.min(timeoutMs, effectiveTimeout.totalWorkflow);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${actualTimeout}ms`));
      }, actualTimeout);
    });

    return Promise.race([operation, timeoutPromise]);
  }
}
