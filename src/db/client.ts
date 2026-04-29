/**
 * Database client. Thin wrapper around @neondatabase/serverless that lets us
 * inject a fake `sql` tag in tests.
 *
 * Production: getSql() lazily constructs a Neon HTTP client from DATABASE_URL.
 * Tests: pass a custom SqlTag into the service factories (see attempts.ts etc).
 */

import { neon } from "@neondatabase/serverless";

/**
 * Postgres tagged-template signature. Compatible with @neondatabase/serverless
 * AND test fakes — the row shape is whatever the underlying tag returns.
 */
export type SqlTag = <T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<T[]>;

let cached: SqlTag | null = null;

/**
 * Get (or lazily construct) the production Neon SQL client. Reuses the
 * connection across calls within a single Vercel function instance.
 *
 * Throws at first call if DATABASE_URL is unset — fail loud in deployment,
 * not silent at module load (which would break dev with stale env vars).
 */
export const getSql = (): SqlTag => {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Provision a Neon database, then set DATABASE_URL " +
        "in .env.local (dev) or in your Vercel project's environment variables (prod). " +
        "See src/db/README.md for setup instructions.",
    );
  }
  // neon() returns a tagged-template function compatible with our SqlTag shape.
  cached = neon(url) as unknown as SqlTag;
  return cached;
};

/**
 * For tests only. Reset the cached client between tests.
 */
export const __resetSqlForTests = (): void => {
  cached = null;
};
