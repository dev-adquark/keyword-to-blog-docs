#!/usr/bin/env node
// Applies db/schema.sql against DATABASE_URL. Safe to re-run (all statements are IF NOT EXISTS).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Aborting migration.");
    process.exit(1);
  }

  const sql = readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
  const client = new pg.Client({
    connectionString,
    ssl: connectionString.includes("sslmode=disable") ? false : { rejectUnauthorized: true },
  });

  await client.connect();
  try {
    console.log("Applying db/schema.sql ...");
    await client.query(sql);
    console.log("Migration complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
