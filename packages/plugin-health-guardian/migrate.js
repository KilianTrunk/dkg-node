const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use the same database as the agent
const dbPath = process.env.DATABASE_URL || path.resolve(__dirname, '../../../apps/agent/database.db');
console.log("Migrating Health Guardian tables to:", dbPath);
const db = new Database(dbPath);

// Read and execute migration SQL
const migrationPath = path.join(__dirname, 'drizzle', '0000_married_ultimates.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

// Split by statement-breakpoint and execute each statement
const statements = migrationSQL.split('--> statement-breakpoint');

for (const statement of statements) {
  const trimmed = statement.trim();
  if (trimmed && !trimmed.startsWith('-->')) {
    try {
      db.exec(trimmed);
      console.log('Executed:', trimmed.substring(0, 50) + '...');
    } catch (error) {
      console.log('Error executing:', trimmed.substring(0, 50) + '...');
      console.error(error);
    }
  }
}

console.log('Migration completed!');
db.close();
