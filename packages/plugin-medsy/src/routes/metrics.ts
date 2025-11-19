import type { Router, Request, Response } from "express";
import type { IMetricsService } from "../types";
import { ServiceContainer } from "../services";

/**
 * Metrics API routes
 */
export function registerMetricsRoutes(
  api: Router,
  serviceContainer: ServiceContainer | null
) {
  // System health check
  api.get("/health/status", async (_req: Request, res: Response) => {
    if (!serviceContainer) {
      return res.status(503).json({
        status: "starting",
        message: "Medsy Plugin is starting up"
      });
    }

    try {
      const metricsService = serviceContainer.get<IMetricsService>("metricsService");
      const health = await metricsService.getSystemHealth();
      res.json(health);
    } catch (error: any) {
      res.status(500).json({
        status: "unhealthy",
        error: error.message || "Health check failed"
      });
    }
  });

  // Detailed metrics endpoints
  api.get("/health/metrics/claims", async (_req: Request, res: Response) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Services not initialized" });
    }

    try {
      const metricsService = serviceContainer.get<IMetricsService>("metricsService");
      const metrics = await metricsService.getClaimsMetrics();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  api.get("/health/metrics/notes", async (_req: Request, res: Response) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Services not initialized" });
    }

    try {
      const metricsService = serviceContainer.get<IMetricsService>("metricsService");
      const metrics = await metricsService.getNotesMetrics();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  api.get("/health/metrics/staking", async (_req: Request, res: Response) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Services not initialized" });
    }

    try {
      const metricsService = serviceContainer.get<IMetricsService>("metricsService");
      const metrics = await metricsService.getStakingMetrics();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  api.get("/health/metrics/premium", async (_req: Request, res: Response) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Services not initialized" });
    }

    try {
      const metricsService = serviceContainer.get<IMetricsService>("metricsService");
      const metrics = await metricsService.getPremiumMetrics();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Comprehensive metrics dashboard
  api.get("/health/metrics", async (_req: Request, res: Response) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Services not initialized" });
    }

    try {
      const metricsService = serviceContainer.get<IMetricsService>("metricsService");
      const health = await metricsService.getSystemHealth();
      res.json(health);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
