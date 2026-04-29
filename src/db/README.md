# `src/db/` — Database layer

Postgres on Neon (serverless), accessed via `@neondatabase/serverless`. Connection is HTTP-based — no connection pool to manage on Vercel.

## Files

- **`schema.sql`** — single source of truth for all tables + indexes. CREATE IF NOT EXISTS everywhere, so applying it repeatedly is safe.
- **`client.ts`** — `getSql()` returns the cached Neon SQL client. `SqlTag` type makes the services injectable for tests.
- **`questions.ts`** — `loadBank(sql?)` loads the question bank into in-memory cache (per the eng review D6 decision). `findQuestion(id)` is a hot-path lookup.
- **`attempts.ts`** — `startAttempt`, `findCurrentAttempt`, `findAttempt`, `countScoredAttempts`, `markAttemptFinished`. Owns the **concurrent-race fix** for the daily-limit check (single-statement INSERT … SELECT WHERE COUNT(*) < 5).
- **`answers.ts`** — `recordAnswer` (server-authoritative; idempotent on retry) + `tallyAttempt`.
- **`scores.ts`** — `writeScore` + `getLeaderboard` (best-score-per-cookie ranking with stable tiebreakers).
- **`notify.ts`** — `signupForNotify` (idempotent on email; refreshes personalization fields on duplicate).

## First-time setup

1. **Sign up at https://neon.tech** (free tier — generous for v1).
2. Create a project, name it `trivia-for-all`. Note the connection string from the dashboard (looks like `postgres://user:pass@host/db?sslmode=require`).
3. Add to `.env.local` in the repo root:
   ```
   DATABASE_URL=postgres://...
   ```
4. Apply the schema:
   ```bash
   npx tsx scripts/migrate.ts
   ```
5. Seed the question bank from the audited JSON:
   ```bash
   npx tsx scripts/seed-questions.ts   # (TODO: lands in a follow-up PR)
   ```

For Vercel deployment, set the same `DATABASE_URL` environment variable in the project settings → Environment Variables. Vercel's Neon integration can also auto-provision and inject this for you.

## Testing pattern

Every service function takes an optional `sql: SqlTag` argument. In production, it defaults to `getSql()`. In tests, you pass a fake — `tests/db/_fakeSql.ts` provides a small spy that records calls and returns canned rows.

```ts
const fakeSql = makeFakeSql({
  // Map a SQL fingerprint (first 40 chars of the joined template) to mock rows
  "INSERT INTO attempts": [{ id: "test-attempt", ...rest }],
});
await startAttempt({ cookieId: "c", dateUtc: "2026-04-29", mode: "scored", sql: fakeSql });
```

This avoids spinning up `pg-mem` or a real test database — fast, deterministic, no surprises.

## Concurrent attempt-start race fix (eng review critical gap #1)

The naive flow — count scored attempts, if < 5 then insert — has a race:

```
Tab A:  COUNT(*) → 4
Tab B:  COUNT(*) → 4
Tab A:  INSERT (count goes to 5)
Tab B:  INSERT (count goes to 6)  ← bug: 6 attempts on a 5-cap day
```

Fix in `attempts.ts → startAttempt`: do the count + insert in ONE statement.

```sql
INSERT INTO attempts (...)
SELECT ..., 'scored', ...
WHERE (
  SELECT COUNT(*) FROM attempts
  WHERE cookie_id = $1 AND date_utc = $2 AND mode = 'scored'
) < 5
RETURNING ...
```

Postgres evaluates the WHERE inside the same statement. The second concurrent caller sees the updated count and the conditional-insert filter excludes it. RETURNING tells us whether the row landed; empty result → daily limit reached.

Verified by `tests/db/attempts.test.ts → "concurrent attempt starts respect the cap"`.
