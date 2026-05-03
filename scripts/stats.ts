/**
 * Quizzle stats CLI — read-only dashboard against live Neon DB.
 *
 * Usage:
 *   npx tsx scripts/stats.ts                  # today (UTC)
 *   npx tsx scripts/stats.ts --days 7         # last 7 days
 *   npx tsx scripts/stats.ts --date 2026-04-29  # specific UTC date
 *
 * Pulls aggregate metrics — distinct players, attempt funnel, score distribution,
 * difficulty calibration, hardest/easiest questions, returning rate.
 *
 * Safety: read-only. No writes, no deletes. Auto-loads .env.local for DATABASE_URL.
 */

import { neon } from "@neondatabase/serverless";
import { existsSync } from "node:fs";

for (const envFile of [".env.local", ".env"]) {
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
    break;
  }
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};
const c = (s: string, code: string) => `${code}${s}${ANSI.reset}`;
const pct = (n: number, total: number) => (total === 0 ? "—" : `${Math.round((n / total) * 100)}%`);
const fmt = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined ? "—" : n.toFixed(digits);

type Args = {
  date: string;
  days: number;
};

const parseArgs = (argv: string[]): Args => {
  const args: Args = {
    date: new Date().toISOString().slice(0, 10),
    days: 1,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--date" && argv[i + 1]) args.date = argv[++i];
    else if (argv[i] === "--days" && argv[i + 1]) args.days = parseInt(argv[++i], 10);
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
  const sql = neon(url) as unknown as <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...params: unknown[]
  ) => Promise<T[]>;

  const isToday = args.date === new Date().toISOString().slice(0, 10) && args.days === 1;
  const header = isToday
    ? `=== Quizzle stats — ${args.date} (today, UTC) ===`
    : args.days > 1
      ? `=== Quizzle stats — last ${args.days} days through ${args.date} (UTC) ===`
      : `=== Quizzle stats — ${args.date} (UTC) ===`;

  console.log(c(header, ANSI.bold + ANSI.cyan));
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // FUNNEL: players, attempts started, attempts finalized, completion rate
  // ─────────────────────────────────────────────────────────────────────────
  const [funnel] = await sql<{
    distinct_players: number;
    attempts_started: number;
    attempts_finalized: number;
    median_duration_s: number | null;
  }>`
    SELECT
      COUNT(DISTINCT cookie_id)::int                         AS distinct_players,
      COUNT(*)::int                                          AS attempts_started,
      COUNT(finished_at)::int                                AS attempts_finalized,
      PERCENTILE_DISC(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at))
      )::float                                               AS median_duration_s
    FROM attempts
    WHERE date_utc >= ${args.date}::date - ${args.days - 1}::int
      AND date_utc <= ${args.date}::date
  `;

  console.log(c("FUNNEL", ANSI.bold));
  console.log(`  Distinct players:           ${funnel.distinct_players}`);
  console.log(`  Attempts started:           ${funnel.attempts_started}`);
  console.log(
    `  Attempts finalized:         ${funnel.attempts_finalized}  (${pct(
      funnel.attempts_finalized,
      funnel.attempts_started,
    )} completion)`,
  );
  console.log(`  Median game duration:       ${funnel.median_duration_s !== null ? `${Math.round(funnel.median_duration_s)}s` : "—"}`);
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // PLAY MODE: solo vs party split. Reads the columns added in v0.6.5.0
  // (Lane A) and v0.6.10.0 (telemetry). Party rows = 0 until soft-launch
  // testers start playing through the ?party=1 flag.
  // ─────────────────────────────────────────────────────────────────────────
  const modeBreakdown = await sql<{
    play_mode: string;
    started: number;
    finalized: number;
  }>`
    SELECT play_mode,
           COUNT(*)::int                AS started,
           COUNT(finished_at)::int      AS finalized
    FROM attempts
    WHERE date_utc >= ${args.date}::date - ${args.days - 1}::int
      AND date_utc <= ${args.date}::date
    GROUP BY play_mode
    ORDER BY play_mode
  `;

  console.log(c("PLAY MODE", ANSI.bold));
  if (modeBreakdown.length === 0) {
    console.log(`  ${c("(no attempts in this window)", ANSI.dim)}`);
  } else {
    console.log(`  ${"".padEnd(8)} ${"started".padStart(10)} ${"finalized".padStart(10)} ${"completion".padStart(12)}`);
    for (const r of modeBreakdown) {
      console.log(
        `  ${r.play_mode.padEnd(8)} ${String(r.started).padStart(10)} ${String(r.finalized).padStart(10)} ${pct(r.finalized, r.started).padStart(12)}`,
      );
    }
  }
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // BROWSER BREAKDOWN: parse user_agent server-side via CASE. Tells us
  // "who's playing on what" — especially the iOS-Safari-vs-Android-Chrome
  // signal we need to know whether voice answering is hitting our gating
  // browsers. Empty until v0.6.10.0 attempts start landing.
  // ─────────────────────────────────────────────────────────────────────────
  const browsers = await sql<{
    browser: string;
    started: number;
    party_started: number;
    party_finalized: number;
    avg_stt_degrade: number | null;
  }>`
    SELECT
      CASE
        WHEN user_agent IS NULL                                              THEN 'unknown (legacy row)'
        WHEN user_agent ILIKE '%CriOS%'                                      THEN 'iOS Chrome'
        WHEN user_agent ILIKE '%FxiOS%'                                      THEN 'iOS Firefox'
        WHEN user_agent ILIKE '%iPhone%' OR user_agent ILIKE '%iPad%'        THEN 'iOS Safari'
        WHEN user_agent ILIKE '%Android%' AND user_agent ILIKE '%Chrome%'    THEN 'Android Chrome'
        WHEN user_agent ILIKE '%Android%' AND user_agent ILIKE '%Firefox%'   THEN 'Android Firefox'
        WHEN user_agent ILIKE '%Android%'                                    THEN 'Android (other)'
        WHEN user_agent ILIKE '%Edg/%'                                       THEN 'Edge'
        WHEN user_agent ILIKE '%Firefox%'                                    THEN 'Desktop Firefox'
        WHEN user_agent ILIKE '%Chrome%'                                     THEN 'Desktop Chrome'
        WHEN user_agent ILIKE '%Safari%'                                     THEN 'Desktop Safari'
        ELSE 'Other'
      END AS browser,
      COUNT(*)::int                                                            AS started,
      COUNT(*) FILTER (WHERE play_mode = 'party')::int                         AS party_started,
      COUNT(*) FILTER (WHERE play_mode = 'party' AND finished_at IS NOT NULL)::int  AS party_finalized,
      AVG(stt_degrade_count) FILTER (WHERE play_mode = 'party')::float         AS avg_stt_degrade
    FROM attempts
    WHERE date_utc >= ${args.date}::date - ${args.days - 1}::int
      AND date_utc <= ${args.date}::date
    GROUP BY browser
    ORDER BY started DESC
  `;

  console.log(c("BROWSER (per attempt)", ANSI.bold));
  if (browsers.length === 0) {
    console.log(`  ${c("(no attempts in this window)", ANSI.dim)}`);
  } else {
    console.log(
      `  ${"browser".padEnd(22)} ${"started".padStart(8)} ${"party".padStart(7)} ${"p.fin".padStart(7)} ${"stt-degrade/attempt".padStart(20)}`,
    );
    for (const r of browsers) {
      const sttCol =
        r.party_started === 0
          ? c("—".padStart(20), ANSI.dim)
          : (r.avg_stt_degrade ?? 0) > 0.5
            ? c(fmt(r.avg_stt_degrade, 2).padStart(20), ANSI.red)
            : (r.avg_stt_degrade ?? 0) > 0.1
              ? c(fmt(r.avg_stt_degrade, 2).padStart(20), ANSI.yellow)
              : c(fmt(r.avg_stt_degrade ?? 0, 2).padStart(20), ANSI.green);
      console.log(
        `  ${r.browser.padEnd(22)} ${String(r.started).padStart(8)} ${String(r.party_started).padStart(7)} ${String(r.party_finalized).padStart(7)} ${sttCol}`,
      );
    }
    // Total party degrade rate — how often does the watchdog give up?
    const partyAttempts = browsers.reduce((acc, r) => acc + r.party_started, 0);
    if (partyAttempts > 0) {
      const totalDegrades = await sql<{ degraded: number; total: number }>`
        SELECT
          COUNT(*) FILTER (WHERE stt_degrade_count > 0)::int  AS degraded,
          COUNT(*)::int                                       AS total
        FROM attempts
        WHERE play_mode = 'party'
          AND date_utc >= ${args.date}::date - ${args.days - 1}::int
          AND date_utc <= ${args.date}::date
      `;
      const td = totalDegrades[0];
      console.log(
        `  ${c("Party attempts that degraded to tap-only:", ANSI.dim)} ${td.degraded} / ${td.total}  (${pct(td.degraded, td.total)})`,
      );
    }
  }
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // SCORES: distribution, lockout count, streak reaches
  // ─────────────────────────────────────────────────────────────────────────
  const [scoreStats] = await sql<{
    avg_score: number | null;
    median_score: number | null;
    p90_score: number | null;
    max_score: number | null;
    finalized_count: number;
  }>`
    SELECT
      AVG(correct_count)::float                                          AS avg_score,
      PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY correct_count)::float  AS median_score,
      PERCENTILE_DISC(0.9) WITHIN GROUP (ORDER BY correct_count)::float  AS p90_score,
      MAX(correct_count)                                                 AS max_score,
      COUNT(*)::int                                                      AS finalized_count
    FROM scores
    WHERE date_utc >= ${args.date}::date - ${args.days - 1}::int
      AND date_utc <= ${args.date}::date
  `;

  // 5/5 lockouts (cookies with 5+ scored attempts that day)
  const lockouts = await sql<{ d: string; cookies_at_cap: number }>`
    SELECT date_utc::text AS d, COUNT(*)::int AS cookies_at_cap
    FROM (
      SELECT cookie_id, date_utc, COUNT(*)::int AS scored_count
      FROM attempts
      WHERE mode = 'scored'
        AND date_utc >= ${args.date}::date - ${args.days - 1}::int
        AND date_utc <= ${args.date}::date
      GROUP BY cookie_id, date_utc
      HAVING COUNT(*) >= 5
    ) capped
    GROUP BY date_utc
  `;
  const totalLockouts = lockouts.reduce((acc, r) => acc + r.cookies_at_cap, 0);

  console.log(c("SCORES (finalized attempts)", ANSI.bold));
  console.log(`  Finalized count:            ${scoreStats.finalized_count}`);
  console.log(`  Avg score:                  ${fmt(scoreStats.avg_score)}`);
  console.log(`  Median score:               ${fmt(scoreStats.median_score, 0)}`);
  console.log(`  P90 score:                  ${fmt(scoreStats.p90_score, 0)}`);
  console.log(`  Max score:                  ${scoreStats.max_score ?? "—"}`);
  console.log(`  5/5 daily lockouts hit:     ${totalLockouts}  (cookie-days)`);
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // DIFFICULTY CALIBRATION: per-difficulty hit rates
  // ─────────────────────────────────────────────────────────────────────────
  const diffStats = await sql<{
    difficulty: string;
    answered: number;
    correct: number;
  }>`
    SELECT q.difficulty, COUNT(*)::int AS answered,
           SUM(CASE WHEN a.correct THEN 1 ELSE 0 END)::int AS correct
    FROM answers a
    JOIN attempts at ON at.id = a.attempt_id
    JOIN questions q ON q.id = a.question_id
    WHERE at.date_utc >= ${args.date}::date - ${args.days - 1}::int
      AND at.date_utc <= ${args.date}::date
    GROUP BY q.difficulty
    ORDER BY CASE q.difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
  `;

  let totalAnswered = 0;
  let weightedSum = 0;
  const diffWeight: Record<string, number> = { easy: 1, medium: 2, hard: 3 };
  for (const r of diffStats) {
    totalAnswered += r.answered;
    weightedSum += r.answered * (diffWeight[r.difficulty] ?? 0);
  }
  const difficultyIndex = totalAnswered > 0 ? weightedSum / totalAnswered : 0;

  console.log(c("DIFFICULTY CALIBRATION", ANSI.bold));
  if (diffStats.length === 0) {
    console.log(`  ${c("(no answers in this window)", ANSI.dim)}`);
  } else {
    console.log(`  ${"".padEnd(8)} ${"answered".padStart(10)} ${"correct".padStart(10)} ${"hit %".padStart(8)}`);
    for (const r of diffStats) {
      const hitPct = r.answered === 0 ? 0 : Math.round((r.correct / r.answered) * 100);
      const colorize = (s: string) =>
        hitPct < 35 ? c(s, ANSI.red) : hitPct > 80 ? c(s, ANSI.green) : c(s, ANSI.yellow);
      console.log(
        `  ${r.difficulty.padEnd(8)} ${String(r.answered).padStart(10)} ${String(r.correct).padStart(10)} ${colorize(`${hitPct}%`.padStart(8))}`,
      );
    }
    console.log(
      `  ${c("Difficulty index:", ANSI.dim)} ${difficultyIndex.toFixed(2)} / 3   ${c("(1=all easy, 3=all hard)", ANSI.dim)}`,
    );
    const hardHit = diffStats.find((r) => r.difficulty === "hard");
    if (hardHit && hardHit.answered > 0 && hardHit.correct / hardHit.answered < 0.35) {
      console.log(
        `  ${c("⚠ Hard hit rate < 35% — bank may skew too hard", ANSI.yellow)}`,
      );
    }
  }
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // RETURNING RATE: cookies playing on 2+ different days in window
  // ─────────────────────────────────────────────────────────────────────────
  if (args.days >= 2) {
    const [returning] = await sql<{
      total_cookies: number;
      returning_cookies: number;
      median_sessions: number | null;
    }>`
      WITH per_cookie AS (
        SELECT cookie_id, COUNT(DISTINCT date_utc)::int AS days_played
        FROM attempts
        WHERE date_utc >= ${args.date}::date - ${args.days - 1}::int
          AND date_utc <= ${args.date}::date
        GROUP BY cookie_id
      )
      SELECT
        COUNT(*)::int                                                      AS total_cookies,
        SUM(CASE WHEN days_played >= 2 THEN 1 ELSE 0 END)::int             AS returning_cookies,
        PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY days_played)::float    AS median_sessions
      FROM per_cookie
    `;
    console.log(c("RETURNING (window ≥ 2 days)", ANSI.bold));
    console.log(
      `  Returning cookies:          ${returning.returning_cookies} / ${returning.total_cookies}  (${pct(returning.returning_cookies, returning.total_cookies)})`,
    );
    console.log(`  Median days played:         ${fmt(returning.median_sessions, 0)}`);
    console.log();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QUESTION PERFORMANCE: hardest + easiest in window (min 3 answers)
  // ─────────────────────────────────────────────────────────────────────────
  const perQuestion = await sql<{
    id: string;
    prompt: string;
    difficulty: string;
    answered: number;
    correct: number;
  }>`
    SELECT q.id, q.prompt, q.difficulty,
           COUNT(*)::int AS answered,
           SUM(CASE WHEN a.correct THEN 1 ELSE 0 END)::int AS correct
    FROM answers a
    JOIN attempts at ON at.id = a.attempt_id
    JOIN questions q ON q.id = a.question_id
    WHERE at.date_utc >= ${args.date}::date - ${args.days - 1}::int
      AND at.date_utc <= ${args.date}::date
    GROUP BY q.id, q.prompt, q.difficulty
    HAVING COUNT(*) >= 3
    ORDER BY (SUM(CASE WHEN a.correct THEN 1 ELSE 0 END)::float / COUNT(*)::float) ASC
  `;

  if (perQuestion.length > 0) {
    console.log(c("QUESTION PERFORMANCE (≥3 answers in window)", ANSI.bold));
    console.log(`  ${c("Top 5 hardest in practice:", ANSI.dim)}`);
    for (const r of perQuestion.slice(0, 5)) {
      const hit = Math.round((r.correct / r.answered) * 100);
      const trunc = r.prompt.length > 60 ? r.prompt.slice(0, 57) + "..." : r.prompt;
      console.log(
        `    ${c(`${hit}%`.padStart(4), hit < 35 ? ANSI.red : ANSI.yellow)}  [${r.difficulty.padEnd(6)}] ${trunc}`,
      );
    }
    console.log(`  ${c("Top 5 easiest in practice:", ANSI.dim)}`);
    for (const r of perQuestion.slice(-5).reverse()) {
      const hit = Math.round((r.correct / r.answered) * 100);
      const trunc = r.prompt.length > 60 ? r.prompt.slice(0, 57) + "..." : r.prompt;
      console.log(
        `    ${c(`${hit}%`.padStart(4), ANSI.green)}  [${r.difficulty.padEnd(6)}] ${trunc}`,
      );
    }
    console.log();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BANK STATE
  // ─────────────────────────────────────────────────────────────────────────
  const bank = await sql<{ difficulty: string; count: number }>`
    SELECT difficulty, COUNT(*)::int AS count
    FROM questions
    GROUP BY difficulty
    ORDER BY CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
  `;
  const bankTotal = bank.reduce((acc, r) => acc + r.count, 0);
  console.log(c("BANK STATE", ANSI.bold));
  console.log(`  Total questions:            ${bankTotal}`);
  for (const r of bank) {
    console.log(
      `    ${r.difficulty.padEnd(8)} ${String(r.count).padStart(4)}  (${pct(r.count, bankTotal)})`,
    );
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
