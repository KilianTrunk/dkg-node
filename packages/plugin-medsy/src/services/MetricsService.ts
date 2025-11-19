import { db } from "../database";
import { healthClaims, communityNotes, stakes, premiumAccess } from "../database/schema";
import { sql, count, sum } from "drizzle-orm";
import { createServiceLogger } from "./Logger";
import type { IMetricsService, MetricsResponse, SystemHealthResponse, HealthClaimStatus } from "../types";

const logger = createServiceLogger("MetricsService");

/**
 * Metrics Service - Health monitoring and analytics for Medsy Plugin
 */
export class MetricsService implements IMetricsService {
  /**
   * Get health claims statistics
   */
  async getClaimsMetrics() {
    try {
      const startTime = Date.now();

      // Count claims by status (filter out null values)
      const statusCounts = await db
        .select({
          status: sql<HealthClaimStatus>`${healthClaims.status}`,
          count: count(),
        })
        .from(healthClaims)
        .where(sql`${healthClaims.status} IS NOT NULL`)
        .groupBy(healthClaims.status);

      // Total claims
      const totalResult = await db
        .select({ count: count() })
        .from(healthClaims);
      const total = totalResult[0]?.count || 0;

      // Claims created in last 24 hours
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentResult = await db
        .select({ count: count() })
        .from(healthClaims)
        .where(sql`${healthClaims.createdAt} >= ${yesterday}`);
      const recent24h = recentResult[0]?.count || 0;

      logger.logPerformance("getClaimsMetrics", Date.now() - startTime);

      return {
        total,
        byStatus: statusCounts,
        recent24h,
      };
    } catch (error) {
      logger.error("Failed to get claims metrics", { error });
      throw error;
    }
  }

  /**
   * Get community notes statistics
   */
  async getNotesMetrics() {
    try {
      const startTime = Date.now();

      // Total notes
      const totalResult = await db
        .select({ count: count() })
        .from(communityNotes);
      const total = totalResult[0]?.count || 0;

      // Notes with DKG UALs (published)
      const publishedResult = await db
        .select({ count: count() })
        .from(communityNotes)
        .where(sql`${communityNotes.ual} IS NOT NULL`);
      const published = publishedResult[0]?.count || 0;

      // Confidence distribution
      const confidenceStats = await db
        .select({
          avgConfidence: sql<number>`avg(${communityNotes.confidence})`,
          minConfidence: sql<number>`min(${communityNotes.confidence})`,
          maxConfidence: sql<number>`max(${communityNotes.confidence})`,
        })
        .from(communityNotes);

      logger.logPerformance("getNotesMetrics", Date.now() - startTime);

      return {
        total,
        published,
        unpublished: total - published,
        confidenceStats: confidenceStats[0] || {
          avgConfidence: 0,
          minConfidence: 0,
          maxConfidence: 0,
        },
      };
    } catch (error) {
      logger.error("Failed to get notes metrics", { error });
      throw error;
    }
  }

  /**
   * Get staking metrics
   */
  async getStakingMetrics() {
    try {
      const startTime = Date.now();

      // Total stakes
      const totalResult = await db
        .select({ count: count() })
        .from(stakes);
      const total = totalResult[0]?.count || 0;

      // Total staked amount
      const amountResult = await db
        .select({ totalAmount: sum(stakes.amount) })
        .from(stakes);
      const totalAmount = amountResult[0]?.totalAmount || 0;

      // Position distribution
      const positionCounts = await db
        .select({
          position: stakes.position,
          count: count(),
          totalAmount: sql<number>`COALESCE(SUM(${stakes.amount}), 0)`,
        })
        .from(stakes)
        .groupBy(stakes.position);

      logger.logPerformance("getStakingMetrics", Date.now() - startTime);

      return {
        totalStakes: total,
        totalAmount: Number(totalAmount),
        byPosition: positionCounts,
      };
    } catch (error) {
      logger.error("Failed to get staking metrics", { error });
      throw error;
    }
  }

  /**
   * Get premium access metrics
   */
  async getPremiumMetrics() {
    try {
      const startTime = Date.now();

      // Total premium accesses
      const totalResult = await db
        .select({ count: count() })
        .from(premiumAccess);
      const total = totalResult[0]?.count || 0;

      // Total revenue
      const revenueResult = await db
        .select({ totalRevenue: sum(premiumAccess.paymentAmount) })
        .from(premiumAccess);
      const totalRevenue = revenueResult[0]?.totalRevenue || 0;

      // Active premium accesses (not expired)
      const now = new Date();
      const activeResult = await db
        .select({ count: count() })
        .from(premiumAccess)
        .where(sql`${premiumAccess.expiresAt} > ${now} OR ${premiumAccess.expiresAt} IS NULL`);
      const active = activeResult[0]?.count || 0;

      logger.logPerformance("getPremiumMetrics", Date.now() - startTime);

      return {
        totalAccesses: total,
        activeAccesses: active,
        totalRevenue: Number(totalRevenue),
      };
    } catch (error) {
      logger.error("Failed to get premium metrics", { error });
      throw error;
    }
  }

  /**
   * Get overall system health metrics
   */
  async getSystemHealth(): Promise<SystemHealthResponse> {
    try {
      const startTime = Date.now();

      const [claims, notes, staking, premium] = await Promise.all([
        this.getClaimsMetrics(),
        this.getNotesMetrics(),
        this.getStakingMetrics(),
        this.getPremiumMetrics(),
      ]);

      // Calculate system health score (0-100)
      const healthScore = this.calculateHealthScore({
        claims,
        notes,
        staking,
        premium,
      });

      // Determine status based on health score
      const status = healthScore >= 80 ? "healthy" : healthScore >= 50 ? "degraded" : "unhealthy";

      logger.logPerformance("getSystemHealth", Date.now() - startTime);

      return {
        healthScore,
        timestamp: new Date().toISOString(),
        status,
        metrics: {
          claims,
          notes,
          staking,
          premium,
        },
      };
    } catch (error) {
      logger.error("Failed to get system health", { error });
      throw error;
    }
  }

  /**
   * Calculate overall health score based on various metrics
   */
  private calculateHealthScore(metrics: MetricsResponse): number {
    let score = 100;

    // Deduct points for low activity
    if (metrics.claims.total === 0) score -= 20;
    if (metrics.notes.total === 0) score -= 15;
    if (metrics.staking.totalStakes === 0) score -= 10;

    // Bonus for high engagement
    if (metrics.notes.published > metrics.notes.total * 0.8) score += 10;
    if (metrics.staking.totalAmount > 1000) score += 5;

    // Cap between 0-100
    return Math.max(0, Math.min(100, score));
  }
}
