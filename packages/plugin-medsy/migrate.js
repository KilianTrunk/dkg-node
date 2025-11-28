#!/usr/bin/env node

/**
 * Database migration script for Medsy Plugin
 * This script runs Drizzle migrations to create/update SQLite database tables
 */

const { drizzle } = require("drizzle-orm/better-sqlite3");
const { migrate } = require("drizzle-orm/better-sqlite3/migrator");
const Database = require("better-sqlite3");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables (load .env.medsy first for Medsy-specific config)
dotenv.config({ path: ".env.medsy" });
dotenv.config(); // Also load from .env if present

async function runMigrations() {
  console.log("🚀 Starting Medsy database migrations...");

  // Get database path from environment
  const databasePath = process.env.MEDSY_DATABASE_PATH || "./medsy.db";

  console.log(`📊 Using database: ${databasePath}`);

  let sqlite;
  try {
    // Create SQLite connection
    sqlite = new Database(databasePath);
    
    // Enable foreign keys
    sqlite.pragma("foreign_keys = ON");

    // Create Drizzle instance
    const db = drizzle(sqlite);

    // Run migrations
    console.log("🔧 Running migrations...");
    migrate(db, {
      migrationsFolder: path.join(__dirname, "drizzle"),
    });

    console.log("✅ Migrations completed successfully!");

    // Verify tables were created
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log(
      `📋 Database has ${tables.length} tables:`,
      tables.map((t) => t.name).join(", "),
    );
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (sqlite) {
      sqlite.close();
      console.log("🔌 Database connection closed");
    }
  }
}

// Run migrations
runMigrations();
