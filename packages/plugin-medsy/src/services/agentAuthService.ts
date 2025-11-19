/**
 * Agent Authentication Service
 * Manages agent identities and wallet addresses for MCP interactions
 */

import { createServiceLogger } from "./Logger";

const logger = createServiceLogger("agentAuthService");

/**
 * Agent identity information
 */
export interface AgentIdentity {
  agentId: string;
  name: string;
  walletAddress: string;
  capabilities: string[];
  registeredAt: Date;
  lastActive: Date;
  trustScore: number;
}

/**
 * Agent Authentication Service
 * Handles agent identity management and wallet address resolution
 */
export class AgentAuthService {
  private initialized = false;

  // In-memory agent registry (in production, this would be in database)
  private agentRegistry = new Map<string, AgentIdentity>();

  async initialize() {
    if (this.initialized) return;

    logger.info("Initializing Agent Authentication Service...");

    // Initialize with demo agents for testing
    this.initializeDemoAgents();

    this.initialized = true;
    logger.info("✅ Agent Authentication Service initialized", {
      registeredAgents: this.agentRegistry.size
    });
  }

  /**
   * Extract agent identity from MCP context
   */
  extractAgentIdentity(ctx: any): AgentIdentity | null {
    try {
      // Try to extract agent information from MCP context
      const agentId = this.extractAgentId(ctx);
      if (!agentId) {
        logger.warn("No agent ID found in context");
        return null;
      }

      // Check if agent is registered
      let agent = this.agentRegistry.get(agentId);
      if (!agent) {
        // Auto-register unknown agents with default wallet
        agent = this.registerAgent(agentId, ctx);
      }

      // Update last active timestamp
      agent.lastActive = new Date();

      return agent;
    } catch (error) {
      logger.error("Failed to extract agent identity", { error });
      return null;
    }
  }

  /**
   * Extract agent ID from various context sources
   */
  private extractAgentId(ctx: any): string | null {
    // Try MCP agent context
    if (ctx?.agent?.id) {
      return ctx.agent.id;
    }

    // Try session context
    if (ctx?.session?.agentId) {
      return ctx.session.agentId;
    }

    // Try user context
    if (ctx?.user?.agentId) {
      return ctx.user.agentId;
    }

    // Try headers or metadata
    if (ctx?.headers?.['x-agent-id']) {
      return ctx.headers['x-agent-id'];
    }

    // Fallback to demo agent for development
    if (process.env.NODE_ENV === 'development') {
      return 'demo_agent_001';
    }

    return null;
  }

  /**
   * Register a new agent
   */
  private registerAgent(agentId: string, ctx: any): AgentIdentity {
    // Extract agent name from context
    const name = this.extractAgentName(ctx) || `Agent ${agentId.slice(-4)}`;

    // Assign wallet address based on agent ID (deterministic for demo)
    const walletAddress = this.generateWalletForAgent(agentId);

    const agent: AgentIdentity = {
      agentId,
      name,
      walletAddress,
      capabilities: ['health_analysis', 'community_notes', 'staking', 'rewards'],
      registeredAt: new Date(),
      lastActive: new Date(),
      trustScore: 0.5 // Start with neutral trust score
    };

    this.agentRegistry.set(agentId, agent);

    logger.info("Agent registered", {
      agentId,
      name,
      walletAddress
    });

    return agent;
  }

  /**
   * Extract agent name from context
   */
  private extractAgentName(ctx: any): string | null {
    if (ctx?.agent?.name) return ctx.agent.name;
    if (ctx?.session?.agentName) return ctx.session.agentName;
    if (ctx?.user?.name) return ctx.user.name;
    return null;
  }

  /**
   * Generate deterministic wallet address for agent
   */
  private generateWalletForAgent(agentId: string): string {
    // In production, agents would provide their own wallet addresses
    // For demo purposes, generate deterministic addresses
    const hash = require('crypto').createHash('sha256').update(agentId).digest('hex');
    return `0x${hash.slice(0, 40)}`;
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentIdentity | null {
    return this.agentRegistry.get(agentId) || null;
  }

  /**
   * Get agent wallet address
   */
  getAgentWallet(agentId: string): string | null {
    const agent = this.getAgent(agentId);
    return agent?.walletAddress || null;
  }

  /**
   * Update agent trust score based on performance
   */
  updateTrustScore(agentId: string, accuracyScore: number): void {
    const agent = this.agentRegistry.get(agentId);
    if (agent) {
      // Update trust score using exponential moving average
      const alpha = 0.1; // Learning rate
      agent.trustScore = agent.trustScore * (1 - alpha) + accuracyScore * alpha;

      logger.info("Agent trust score updated", {
        agentId,
        oldScore: agent.trustScore.toFixed(3),
        newScore: agent.trustScore.toFixed(3),
        accuracyScore
      });
    }
  }

  /**
   * Validate agent wallet address format
   */
  validateWalletAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): AgentIdentity[] {
    return Array.from(this.agentRegistry.values());
  }

  /**
   * Initialize demo agents for testing
   */
  private initializeDemoAgents(): void {
    const demoAgents: AgentIdentity[] = [
      {
        agentId: 'demo_agent_001',
        name: 'Medsy Agent',
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        capabilities: ['health_analysis', 'community_notes', 'staking', 'rewards'],
        registeredAt: new Date(),
        lastActive: new Date(),
        trustScore: 0.8
      },
      {
        agentId: 'agent_123',
        name: 'Legacy Analysis Agent',
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44f',
        capabilities: ['health_analysis'],
        registeredAt: new Date(Date.now() - 86400000), // 1 day ago
        lastActive: new Date(Date.now() - 3600000), // 1 hour ago
        trustScore: 0.6
      }
    ];

    demoAgents.forEach(agent => {
      this.agentRegistry.set(agent.agentId, agent);
    });

    logger.info("Demo agents initialized", {
      count: demoAgents.length
    });
  }

  /**
   * Clean up inactive agents (optional maintenance)
   */
  cleanupInactiveAgents(maxAgeHours: number = 168): void { // 1 week default
    const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    let cleaned = 0;

    for (const [agentId, agent] of this.agentRegistry.entries()) {
      if (agent.lastActive.getTime() < cutoff) {
        this.agentRegistry.delete(agentId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info("Cleaned up inactive agents", { cleaned });
    }
  }
}

/**
 * Helper function to get authenticated agent from context
 */
export function getAuthenticatedAgent(ctx: any): AgentIdentity | null {
  const authService = new AgentAuthService();
  // Note: In a real implementation, this would be a singleton service
  // For now, create new instance (not ideal but works for demo)
  return authService.extractAgentIdentity(ctx);
}

/**
 * Helper function to require authenticated agent
 */
export function requireAuthenticatedAgent(ctx: any): AgentIdentity {
  const agent = getAuthenticatedAgent(ctx);
  if (!agent) {
    throw new Error("Agent authentication required - no valid agent identity found in context");
  }
  return agent;
}
