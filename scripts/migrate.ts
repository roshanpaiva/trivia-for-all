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
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Auto-load .env.local (Next.js convention) so plain `npx tsx scripts/migrate.ts`
// works without --env-file. process.loadEnvFile is built into Node >= 20.12.
// Only loads if the file exists; otherwise falls through to whatever's already
// in process.env (for CI / Vercel where env vars are injected by the platform).
for (const envFile of [".env.local", ".env"]) {
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
    break;
  }
}

const main = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    console.error("Set it in .env.local (recommended) or in your shell env, then re-run.");
    process.exit(1);
  }

  const schemaPath = join(process.cwd(), "src", "db", "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");

  // The Neon HTTP driver doesn't support multi-statement SQL via the tagged-
  // template form. Strip line comments (so semicolons inside `-- ...` don't
  // confuse the splitter), then split on `;`. schema.sql has no string literals
  // containing semicolons, so this is safe.
  const cleaned = schema.replace(/--[^\n]*$/gm, "");
  const statements = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

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
