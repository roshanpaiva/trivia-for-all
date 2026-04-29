/**
 * Dev tool: reset today's attempts + scores so you can keep play-testing
 * without burning through your 5/day cap.
 *
 * Usage:
 *   npx tsx scripts/reset-attempts.ts --cookie <id>     # one specific cookie
 *   npx tsx scripts/reset-attempts.ts --all-today        # everyone, today (be careful)
 *   npx tsx scripts/reset-attempts.ts --me               # the most recently active cookie (handy on local)
 *
 * Deletes scores rows + attempts rows for the chosen scope, scoped to the
 * current UTC date. Question bank, identity cookies on the client, and
 * yesterday's history are all untouched.
 *
 * Safety:
 *   - Refuses to run against a DATABASE_URL whose host contains "prod" or
 *     "production" unless --i-am-sure is passed.
 *   - Prints what it deleted at the end.
 */

import { neon } from "@neondatabase/serverless";
import { existsSync } from "node:fs";

for (const envFile of [".env.local", ".env"]) {
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
    break;
  }
}

type Args = {
  cookie?: string;
  allToday: boolean;
  me: boolean;
  list: boolean;
  iAmSure: boolean;
};

const parseArgs = (argv: string[]): Args => {
  const args: Args = { allToday: false, me: false, list: false, iAmSure: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cookie") args.cookie = argv[++i];
    else if (a === "--all-today") args.allToday = true;
    else if (a === "--me") args.me = true;
    else if (a === "--list") args.list = true;
    else if (a === "--i-am-sure") args.iAmSure = true;
  }
  return args;
};

const main = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  if (!args.cookie && !args.allToday && !args.me && !args.list) {
    console.error("Pick a scope:");
    console.error("  --list          show every cookie's attempt counts today (no deletes)");
    console.error("  --cookie <id>   reset one specific cookie");
    console.error("  --me            reset the most recently active cookie (handy on local)");
    console.error("  --all-today     reset everyone today (DANGEROUS in prod — refuses without --i-am-sure)");
    process.exit(1);
  }

  // Safety gate for prod-ish URLs
  const looksLikeProd = /prod(uction)?/i.test(url);
  if (looksLikeProd && !args.iAmSure) {
    console.error("DATABASE_URL looks like production. Refusing without --i-am-sure.");
    process.exit(1);
  }

  const sql = neon(url) as unknown as <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...params: unknown[]
  ) => Promise<T[]>;

  const today = new Date().toISOString().slice(0, 10);

  // List mode: show every cookie's counts today, then exit. No deletes.
  if (args.list) {
    const rows = await sql<{
      cookie_id: string;
      scored: string;
      practice: string;
      latest_at: Date;
    }>`
      SELECT cookie_id,
             COUNT(*) FILTER (WHERE mode = 'scored')::text   AS scored,
             COUNT(*) FILTER (WHERE mode = 'practice')::text AS practice,
             MAX(started_at) AS latest_at
      FROM attempts
      WHERE date_utc = ${today}::date
      GROUP BY cookie_id
      ORDER BY MAX(started_at) DESC
    `;
    if (rows.length === 0) {
      console.log(`No attempts today (${today}).`);
      return;
    }
    console.log(`Cookies active today (${today}):`);
    for (const r of rows) {
      console.log(`  ${r.cookie_id}  scored=${r.scored}/5  practice=${r.practice}  latest=${new Date(r.latest_at).toISOString()}`);
    }
    return;
  }

  // Resolve cookie filter
  let cookieFilter: string | null = null;
  if (args.cookie) {
    cookieFilter = args.cookie;
  } else if (args.me) {
    // Prefer the most recent SCORED attempt — that's almost always the
    // play-tester's cookie (curl tests typically don't finalize scored rows).
    const recent = await sql<{ cookie_id: string }>`
      SELECT cookie_id
      FROM attempts
      WHERE date_utc = ${today}::date AND mode = 'scored'
      ORDER BY started_at DESC
      LIMIT 1
    `;
    if (recent.length === 0) {
      console.log(`No scored attempts today (${today}). Try --list to find your cookie, or pass --cookie <id>.`);
      return;
    }
    cookieFilter = recent[0].cookie_id;
    console.log(`--me resolved to cookie: ${cookieFilter}`);
  }

  // Delete scores first (FK to attempts via ON DELETE CASCADE handles it too,
  // but being explicit makes the row counts informative).
  const scoresDeleted = cookieFilter
    ? await sql<{ id: number }>`
        DELETE FROM scores
        WHERE date_utc = ${today}::date AND cookie_id = ${cookieFilter}
        RETURNING id
      `
    : await sql<{ id: number }>`
        DELETE FROM scores
        WHERE date_utc = ${today}::date
        RETURNING id
      `;

  // Then attempts (cascades to answers).
  const attemptsDeleted = cookieFilter
    ? await sql<{ id: string }>`
        DELETE FROM attempts
        WHERE date_utc = ${today}::date AND cookie_id = ${cookieFilter}
        RETURNING id
      `
    : await sql<{ id: string }>`
        DELETE FROM attempts
        WHERE date_utc = ${today}::date
        RETURNING id
      `;

  const scope = cookieFilter ? `cookie ${cookieFilter}` : "ALL cookies";
  console.log(`\nReset complete (${today}, ${scope}):`);
  console.log(`  scores deleted:   ${scoresDeleted.length}`);
  console.log(`  attempts deleted: ${attemptsDeleted.length}`);
  console.log(`  (answers cascaded automatically)`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
