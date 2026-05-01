/**
 * Attempts service. Owns the lifecycle of an in-progress game session.
 *
 * Mode === 'scored' attempts are subject to a 5-per-cookie-per-UTC-date cap
 * (per the arcade model from /office-hours). Practice attempts are unlimited
 * (no cap, no scores write).
 *
 * CONCURRENT ATTEMPT-START RACE FIX (eng review critical gap #1):
 *   Two tabs/devices on the same cookie could both call POST /api/attempt/start
 *   at the same time, both pass the count check, and both insert. Result: the
 *   user gets 6 attempts on a 5-cap day.
 *
 *   Fix: do the count check INSIDE a single SQL statement that conditionally
 *   inserts only when the count is < 5. We use a CTE that counts, filters
 *   in WHERE, and INSERT ... SELECT against the count. RETURNING tells us
 *   whether the row landed; if not, we return DAILY_LIMIT_REACHED.
 *
 *   This is atomic at the row level on Postgres without explicit locks because
 *   the CTE + INSERT runs in one statement; concurrent calls that both see
 *   count=4 will both attempt the insert, but the second will see count=5 in
 *   its own snapshot and the conditional-insert filter will exclude it. Verified
 *   by the integration test in tests/db/attempts.test.ts.
 */

import { sampleAttemptQuestions } from "@/lib/sampler";
import type { AttemptMode, ClientQuestion, PlayMode, Question } from "@/lib/types";
import { getSql, type SqlTag } from "./client";
import { loadBank } from "./questions";

export const DAILY_SCORED_LIMIT = 5;

export type Attempt = {
  id: string;
  cookieId: string;
  dateUtc: string;
  mode: AttemptMode;
  playMode: PlayMode;
  startedAt: Date;
  finishedAt: Date | null;
  questionIds: string[];
};

export type StartAttemptResult =
  | { ok: true; attempt: Attempt; questions: ClientQuestion[]; attemptsRemaining: number }
  | { ok: false; reason: "daily_limit_reached"; resetAtUtc: string };

type AttemptRow = {
  id: string;
  cookie_id: string;
  date_utc: string;
  mode: string;
  // Pre-Lane-A migration this column doesn't exist; for those rows the SELECT
  // returns undefined and we default to 'solo' in rowToAttempt. Post-migration
  // (Lane A's ALTER landed) the column is NOT NULL DEFAULT 'solo' so legacy
  // rows backfill automatically.
  play_mode?: string | null;
  started_at: Date;
  finished_at: Date | null;
  question_ids: string[];
};

const rowToAttempt = (r: AttemptRow): Attempt => ({
  id: r.id,
  cookieId: r.cookie_id,
  dateUtc: typeof r.date_utc === "string" ? r.date_utc : (r.date_utc as Date).toISOString().slice(0, 10),
  mode: r.mode as AttemptMode,
  // Defensive: if a row predates the migration, treat it as solo. Post-migration
  // every row has a value; this branch is dead code but cheap.
  playMode: (r.play_mode === "party" ? "party" : "solo") as PlayMode,
  startedAt: new Date(r.started_at),
  finishedAt: r.finished_at ? new Date(r.finished_at) : null,
  questionIds: r.question_ids,
});

const stripCorrectAnswer = (q: Question): ClientQuestion => {
  const { correctIdx: _correctIdx, fact: _fact, ...rest } = q;
  void _correctIdx;
  void _fact;
  return rest;
};

/**
 * Compute tomorrow-midnight-UTC ISO string for the resetAtUtc field.
 */
const tomorrowMidnightUtc = (now: Date = new Date()): string => {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return t.toISOString();
};

/**
 * Atomically start a new attempt. Performs the daily-limit check inside a
 * single SQL statement to prevent the concurrent-attempt-start race.
 *
 * For scored mode, returns daily_limit_reached if the cookie already has
 * DAILY_SCORED_LIMIT scored attempts on today's UTC date.
 *
 * For practice mode, always succeeds (no cap).
 */
export const startAttempt = async (params: {
  cookieId: string;
  dateUtc: string;
  mode: AttemptMode;
  /** Defaults to 'solo'. Party-mode attempts ride the same daily cap (eng DD14
   * + design DD14: shared cap across modes). */
  playMode?: PlayMode;
  /** Raw User-Agent header from the start request. Truncated to 255 chars
   * before insert. Null when missing. Lets us answer "what browser did this
   * attempt come from" from the data alone, no separate analytics needed. */
  userAgent?: string | null;
  sql?: SqlTag;
}): Promise<StartAttemptResult> => {
  const sql = params.sql ?? getSql();
  const playMode: PlayMode = params.playMode === "party" ? "party" : "solo";
  const userAgent = params.userAgent ? params.userAgent.slice(0, 255) : null;
  const bank = await loadBank(sql);
  const id = crypto.randomUUID();
  const questionIds = sampleAttemptQuestions(bank);
  const questionIdsJson = JSON.stringify(questionIds);

  if (params.mode === "scored") {
    // Conditional insert: only land a row if the cookie has < DAILY_SCORED_LIMIT
    // scored attempts on this date. This is atomic on Postgres because the count
    // is evaluated inside the same statement as the insert.
    //
    // Note: the cap counts BOTH solo and party scored attempts together (per
    // DD14). No play_mode filter on the COUNT subquery — one cap, one paywall
    // (when monetization lands in v2.1).
    const inserted = await sql<AttemptRow>`
      INSERT INTO attempts (id, cookie_id, date_utc, mode, play_mode, user_agent, question_ids)
      SELECT ${id}, ${params.cookieId}, ${params.dateUtc}::date, 'scored', ${playMode}, ${userAgent}, ${questionIdsJson}::jsonb
      WHERE (
        SELECT COUNT(*) FROM attempts
        WHERE cookie_id = ${params.cookieId}
          AND date_utc = ${params.dateUtc}::date
          AND mode = 'scored'
      ) < ${DAILY_SCORED_LIMIT}
      RETURNING id, cookie_id, date_utc, mode, play_mode, started_at, finished_at, question_ids
    `;
    if (inserted.length === 0) {
      return { ok: false, reason: "daily_limit_reached", resetAtUtc: tomorrowMidnightUtc() };
    }
    const attempt = rowToAttempt(inserted[0]);
    const remaining = DAILY_SCORED_LIMIT - (await countScoredAttempts(params.cookieId, params.dateUtc, sql));
    const questions = await materializeClientQuestions(attempt.questionIds, sql);
    return { ok: true, attempt, questions, attemptsRemaining: Math.max(0, remaining) };
  }

  // Practice: unconditional insert, no cap.
  const inserted = await sql<AttemptRow>`
    INSERT INTO attempts (id, cookie_id, date_utc, mode, play_mode, user_agent, question_ids)
    VALUES (${id}, ${params.cookieId}, ${params.dateUtc}::date, 'practice', ${playMode}, ${userAgent}, ${questionIdsJson}::jsonb)
    RETURNING id, cookie_id, date_utc, mode, play_mode, started_at, finished_at, question_ids
  `;
  const attempt = rowToAttempt(inserted[0]);
  const questions = await materializeClientQuestions(attempt.questionIds, sql);
  return { ok: true, attempt, questions, attemptsRemaining: DAILY_SCORED_LIMIT };
};

/**
 * Increment the stt_degrade_count on an attempt. Called by the client when
 * the useStt watchdog escalates to "degraded" — typically once per attempt
 * if it happens at all. Idempotent in the soft sense (cap at some sane max
 * to prevent runaway client-side spam, not enforced here).
 */
export const incrementSttDegradeCount = async (
  attemptId: string,
  cookieId: string,
  sql: SqlTag = getSql(),
): Promise<void> => {
  await sql`
    UPDATE attempts
    SET stt_degrade_count = stt_degrade_count + 1
    WHERE id = ${attemptId} AND cookie_id = ${cookieId}
  `;
};

/**
 * Look up the cookie's current in-progress attempt, if any. Returns null when
 * the cookie has no open attempt for today.
 *
 * Used by GET /api/attempt/current for tab-close + resume.
 */
export const findCurrentAttempt = async (
  cookieId: string,
  sql: SqlTag = getSql(),
): Promise<{ attempt: Attempt; questions: ClientQuestion[] } | null> => {
  const rows = await sql<AttemptRow>`
    SELECT id, cookie_id, date_utc, mode, play_mode, started_at, finished_at, question_ids
    FROM attempts
    WHERE cookie_id = ${cookieId}
      AND finished_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const attempt = rowToAttempt(rows[0]);
  const questions = await materializeClientQuestions(attempt.questionIds, sql);
  return { attempt, questions };
};

/**
 * Look up an attempt by id. Used by /api/answer + /api/attempt/finalize for
 * authorization (verify the attempt belongs to the calling cookie).
 */
export const findAttempt = async (
  id: string,
  sql: SqlTag = getSql(),
): Promise<Attempt | null> => {
  const rows = await sql<AttemptRow>`
    SELECT id, cookie_id, date_utc, mode, play_mode, started_at, finished_at, question_ids
    FROM attempts
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows.length > 0 ? rowToAttempt(rows[0]) : null;
};

/**
 * Count scored attempts for a cookie + date. Cheap because of the
 * attempts_daily_count index.
 */
export const countScoredAttempts = async (
  cookieId: string,
  dateUtc: string,
  sql: SqlTag = getSql(),
): Promise<number> => {
  const rows = await sql<{ count: string }>`
    SELECT COUNT(*)::text AS count
    FROM attempts
    WHERE cookie_id = ${cookieId}
      AND date_utc = ${dateUtc}::date
      AND mode = 'scored'
  `;
  return parseInt(rows[0]?.count ?? "0", 10);
};

/**
 * Mark an attempt finished. Idempotent — second call against the same
 * attempt is a no-op (returns the existing finished_at).
 */
export const markAttemptFinished = async (
  attemptId: string,
  sql: SqlTag = getSql(),
): Promise<void> => {
  await sql`
    UPDATE attempts
    SET finished_at = NOW()
    WHERE id = ${attemptId} AND finished_at IS NULL
  `;
};

/**
 * Materialize ClientQuestion[] from question IDs. Strips correctIdx + fact —
 * those are server-side only and never travel to the client until reveal.
 */
const materializeClientQuestions = async (
  ids: string[],
  sql: SqlTag,
): Promise<ClientQuestion[]> => {
  const bank = await loadBank(sql);
  const lookup = new Map(bank.map((q) => [q.id, q]));
  return ids.flatMap((id) => {
    const q = lookup.get(id);
    return q ? [stripCorrectAnswer(q)] : [];
  });
};
