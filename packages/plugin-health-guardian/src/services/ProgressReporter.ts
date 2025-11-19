import type { WorkflowProgress } from "../types";
import { WorkflowConfig } from "./WorkflowConfig";

/**
 * Progress callback for workflow execution
 */
export type ProgressCallback = (progress: WorkflowProgress) => void;

/**
 * Progress reporter for workflow execution
 */
export class ProgressReporter {
  private lastReportTime = Date.now();
  private interval: NodeJS.Timeout | null = null;

  constructor(private callback?: ProgressCallback) {}

  /**
   * Start progress reporting
   */
  start(): void {
    if (WorkflowConfig.progressReporting.enabled && this.callback) {
      this.interval = setInterval(() => {
        const elapsed = Date.now() - this.lastReportTime;
        if (elapsed >= WorkflowConfig.progressReporting.interval) {
          // Send a heartbeat progress update
          this.callback!({
            currentStep: "processing",
            stepNumber: 0,
            totalSteps: 5,
            percentage: 0,
            message: "Processing... please wait",
            startTime: Date.now(),
            elapsedTime: elapsed,
            estimatedTimeRemaining: WorkflowConfig.timeouts.totalWorkflow - elapsed
          });
        }
      }, WorkflowConfig.progressReporting.interval);
    }
  }

  /**
   * Report progress
   */
  report(step: string, stepNumber: number, totalSteps: number, message: string): void {
    if (this.callback) {
      const now = Date.now();
      const elapsed = now - this.lastReportTime;
      this.lastReportTime = now;

      const progress: WorkflowProgress = {
        currentStep: step,
        stepNumber,
        totalSteps,
        percentage: Math.round((stepNumber / totalSteps) * 100),
        message,
        startTime: now,
        elapsedTime: elapsed,
        estimatedTimeRemaining: Math.max(0, WorkflowConfig.timeouts.totalWorkflow - elapsed)
      };

      this.callback(progress);
    }
  }

  /**
   * Stop progress reporting
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
