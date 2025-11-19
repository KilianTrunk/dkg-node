import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import * as schema from "./schema";

// Initialize SQLite database - use the same database as the agent
const dbPath = process.env.DATABASE_URL || path.resolve(__dirname, "../../../apps/agent/database.db");
console.log("Medsy DB Path:", dbPath);
const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrent access
sqlite.pragma("journal_mode = WAL");

// Create drizzle instance
export const db = drizzle(sqlite, { schema });

// Export schema for convenience
export * from "./schema";
