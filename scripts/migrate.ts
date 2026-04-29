/**
 * Apply src/db/schema.sql against the database in $DATABASE_URL.
 *
 * Usage:
 *   DATABASE_URL='postgres://...' npx tsx scripts/migrate.ts
 *
 * Idempotent — schema.sql uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
 * everywhere, so repeated runs are safe. For real schema migrations beyond v1,
 * graduate to a migration framework (drizzle-kit, prisma, etc.).
 */

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const main = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const schemaPath = join(process.cwd(), "src", "db", "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");

  // The Neon driver doesn't support running multi-statement SQL in one call
  // via the tagged-template form. Split on semicolons and run each statement.
  // Naive split is fine here — schema.sql has no semicolons inside string literals.
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  const sql = neon(url);
  for (const stmt of statements) {
    process.stdout.write(`Applying: ${stmt.split("\n")[0].slice(0, 80)}... `);
    // The neon `query` method runs an arbitrary string statement (no template).
    await (sql as unknown as { query: (s: string) => Promise<unknown> }).query(stmt);
    console.log("ok");
  }

  console.log(`\nApplied ${statements.length} statements from ${schemaPath}.`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
