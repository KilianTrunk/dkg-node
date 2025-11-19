import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs";

/**
 * Logger Service - Centralized logging for the Medsy Plugin
 *
 * Features:
 * - Multiple log levels (error, warn, info, debug)
 * - Console output with colors
 * - Daily rotating file logs
 * - Structured logging with metadata
 * - Separate error log file
 */

// Ensure logs directory exists (relative to plugin package root)
const logsDir = path.resolve(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create initial log file if it doesn't exist (for tail command)
const today = new Date().toISOString().split("T")[0];
const initialLogFile = path.join(logsDir, `health-guardian-${today}.log`);
if (!fs.existsSync(initialLogFile)) {
  // Create empty file only if it doesn't exist
  fs.closeSync(fs.openSync(initialLogFile, "w"));
}

// Custom format for better readability
const customFormat = winston.format.printf(
  ({ timestamp, level, message, service, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase().padEnd(5)}] ${service ? `[${service}]` : ""} ${message}`;

    // Add metadata if present, formatted nicely
    if (Object.keys(metadata).length > 0) {
      const metadataStr = JSON.stringify(metadata, null, 0);
      msg += `\n    ${metadataStr}`;
    }

    return msg;
  },
);

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    customFormat,
  ),
  defaultMeta: { service: "HealthGuardian" },
  transports: [
    // Console transport with colors
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        customFormat,
      ),
    }),

    // Daily rotating file for all logs
    new DailyRotateFile({
      filename: path.join(logsDir, "health-guardian-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "14d", // Keep logs for 14 days
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),

    // Separate file for errors
    new DailyRotateFile({
      filename: path.join(logsDir, "health-guardian-error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxSize: "20m",
      maxFiles: "30d", // Keep error logs for 30 days
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
  ],
});

// Create service-specific loggers
export const createServiceLogger = (serviceName: string) => {
  return {
    error: (message: string, metadata?: any) => {
      logger.error(message, { service: serviceName, ...metadata });
    },
    warn: (message: string, metadata?: any) => {
      logger.warn(message, { service: serviceName, ...metadata });
    },
    info: (message: string, metadata?: any) => {
      logger.info(message, { service: serviceName, ...metadata });
    },
    debug: (message: string, metadata?: any) => {
      logger.debug(message, { service: serviceName, ...metadata });
    },
    // Log claim processing events
    logClaimEvent: (claimId: string, event: string, metadata?: any) => {
      logger.info(`Claim ${claimId}: ${event}`, {
        service: serviceName,
        claimId,
        event,
        ...metadata,
      });
    },
    // Log performance metrics
    logPerformance: (operation: string, duration: number, metadata?: any) => {
      logger.info(`Performance: ${operation} took ${duration}ms`, {
        service: serviceName,
        operation,
        duration,
        ...metadata,
      });
    },
  };
};

// Export default logger
export default logger;

// Export specific service loggers
export const aiLogger = createServiceLogger("AIAnalysisService");
export const dkgLogger = createServiceLogger("DkgService");
export const tokenomicsLogger = createServiceLogger("TokenomicsService");
export const paymentLogger = createServiceLogger("PaymentService");
