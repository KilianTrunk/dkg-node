import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "./schema";

// Initialize SQLite database - prefer configured path, otherwise local medsy.db
const dbPath =
  process.env.MEDSY_DATABASE_PATH ||
  path.resolve(__dirname, "../../../../apps/agent/medsy.db");

console.log("Medsy DB Path:", dbPath);

// Ensure directory exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrent access
sqlite.pragma("journal_mode = WAL");

// Create drizzle instance
export const db = drizzle(sqlite, { schema });

// Export schema for convenience
export * from "./schema";
