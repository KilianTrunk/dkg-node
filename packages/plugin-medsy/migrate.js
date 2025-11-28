#!/usr/bin/env node

/**
 * Database migration script for Medsy Plugin
 * This script runs Drizzle migrations to create/update SQLite database tables
 */

const Database = require("better-sqlite3");
const { drizzle } = require("drizzle-orm/better-sqlite3");
const { migrate } = require("drizzle-orm/better-sqlite3/migrator");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

// Load environment variables from .env.medsy
const envPath = path.join(__dirname, ".env.medsy");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
dotenv.config(); // Also load from root .env if present

async function runMigrations() {
  console.log("🚀 Starting Medsy database migrations...");

  // Get database path - use same database as agent (matches plugin code)
  // Priority: DATABASE_URL > MEDSY_DATABASE_PATH > default to agent's database.db
  const dbPath = process.env.DATABASE_URL || 
                 process.env.MEDSY_DATABASE_PATH || 
                 path.resolve(__dirname, "../../apps/agent/database.db");
  console.log(`📊 Database path: ${dbPath}`);

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  try {
    // Create SQLite connection
    const sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL"); // Enable WAL mode for better concurrency

    // Create Drizzle instance
    const db = drizzle(sqlite);

    // Run migrations
    console.log("🔧 Running migrations...");
    migrate(db, {
      migrationsFolder: path.join(__dirname, "drizzle"),
    });

    console.log("✅ Migrations completed successfully!");

    // Verify tables were created
    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .all();
    console.log(
      `📋 Found ${tables.length} tables:`,
      tables.map((t) => t.name).join(", ")
    );

    sqlite.close();
    console.log("🔌 Database connection closed");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migrations
runMigrations();
