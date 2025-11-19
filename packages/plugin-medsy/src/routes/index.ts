import type { Router } from "express";
import { ServiceContainer } from "../services";
import { registerClaimsRoutes } from "./claims";
import { registerNotesRoutes } from "./notes";
import { registerStakingRoutes } from "./staking";
import { registerRewardsRoutes } from "./rewards";
import { registerMetricsRoutes } from "./metrics";
import { registerPaymentRoutes } from "./payments";

/**
 * Register all API routes for the Medsy plugin
 */
export function registerAllRoutes(
  api: Router,
  serviceContainer: ServiceContainer | null
) {
  registerClaimsRoutes(api, serviceContainer);
  registerNotesRoutes(api, serviceContainer);
  registerStakingRoutes(api, serviceContainer);
  registerRewardsRoutes(api, serviceContainer);
  registerMetricsRoutes(api, serviceContainer);
  registerPaymentRoutes(api, serviceContainer);
}
