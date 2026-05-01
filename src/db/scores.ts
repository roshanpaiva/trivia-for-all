/**
 * Scores service. Owns final-score persistence + leaderboard query.
 *
 * Per the design doc → Best-score-today rule:
 *   The leaderboard reads MAX(correct_count) per (cookie_id, date_utc) from
 *   the scores table. Each user has at most ONE leaderboard entry per day,
 *   even with up to 5 attempts.
 */

import { getSql, type SqlTag } from "./client";

export type ScoreRow = {
  id: number;
  attemptId: string;
  cookieId: string;
  dateUtc: string;
  correctCount: number;
  wrongCount: number;
  finishedAt: Date;
  displayName: string | null;
};

export type LeaderboardEntry = {
  rank: number;
  cookieId: string;
  bestScore: number;
  bestWrong: number;
  bestFinishedAt: Date;
  displayName: string | null;
};

export type LeaderboardResult = {
  top: LeaderboardEntry[];
  yourRank: number | null;
  yourBestToday: number | null;
  totalPlayers: number;
  dateUtc: string;
};

export type AllTimeLeaderboardResult = {
  top: LeaderboardEntry[];
  yourRank: number | null;
  yourPersonalBest: number | null;
};

type RawScoreRow = {
  id: number;
  attempt_id: string;
  cookie_id: string;
  date_utc: string;
  correct_count: number;
  wrong_count: number;
  finished_at: Date;
  display_name: string | null;
};

const rowToScore = (r: RawScoreRow): ScoreRow => ({
  id: r.id,
  attemptId: r.attempt_id,
  cookieId: r.cookie_id,
  dateUtc: typeof r.date_utc === "string" ? r.date_utc : (r.date_utc as Date).toISOString().slice(0, 10),
  correctCount: r.correct_count,
  wrongCount: r.wrong_count,
  finishedAt: new Date(r.finished_at),
  displayName: r.display_name ?? null,
});

/**
 * Trim + length-clamp a player-supplied display name. Returns null for empty
 * or whitespace-only input. 30 char cap matches the schema (text but capped
 * here at the boundary) and keeps leaderboard rows from breaking layout.
 */
export const sanitizeDisplayName = (raw: string | null | undefined): string | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 30);
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Persist the final score for an attempt. Idempotent — the unique constraint
 * on attempt_id means a duplicate write is silently a no-op (returns the
 * existing row).
 */
export const writeScore = async (params: {
  attemptId: string;
  cookieId: string;
  dateUtc: string;
  correctCount: number;
  wrongCount: number;
  displayName?: string | null;
  sql?: SqlTag;
}): Promise<ScoreRow> => {
  const sql = params.sql ?? getSql();
  const displayName = sanitizeDisplayName(params.displayName ?? null);
  const rows = await sql<RawScoreRow>`
    INSERT INTO scores (attempt_id, cookie_id, date_utc, correct_count, wrong_count, finished_at, display_name)
    VALUES (
      ${params.attemptId},
      ${params.cookieId},
      ${params.dateUtc}::date,
      ${params.correctCount},
      ${params.wrongCount},
      NOW(),
      ${displayName}
    )
    ON CONFLICT (attempt_id) DO UPDATE
      SET correct_count = EXCLUDED.correct_count,
          wrong_count   = EXCLUDED.wrong_count,
          display_name  = COALESCE(EXCLUDED.display_name, scores.display_name)
    RETURNING id, attempt_id, cookie_id, date_utc, correct_count, wrong_count, finished_at, display_name
  `;
  return rowToScore(rows[0]);
};

/**
 * Today's leaderboard (top N) + the caller's rank if any.
 *
 * Returns one row per cookieId — the user's BEST score across their up-to-5
 * scored attempts. Tiebreakers: correct DESC → wrong ASC → finished ASC → id ASC.
 *
 * The "your rank" lookup is a separate query against the same base data so
 * we can pin you to the leaderboard view even when you're outside the top N.
 */
export const getLeaderboard = async (params: {
  dateUtc: string;
  cookieId: string | null;
  limit?: number;
  sql?: SqlTag;
}): Promise<LeaderboardResult> => {
  const sql = params.sql ?? getSql();
  const limit = params.limit ?? 100;

  // Top-N: best per cookie, ranked. display_name picks the most recent non-null
  // value for the cookie that day (so a player can rename mid-day and the new
  // name shows up on the leaderboard).
  const topRows = await sql<{
    cookie_id: string;
    best_score: number;
    best_wrong: number;
    best_finished_at: Date;
    display_name: string | null;
  }>`
    SELECT cookie_id,
           MAX(correct_count) AS best_score,
           MIN(wrong_count) AS best_wrong,
           MIN(finished_at) AS best_finished_at,
           (
             SELECT s2.display_name
             FROM scores s2
             WHERE s2.cookie_id = scores.cookie_id
               AND s2.date_utc = ${params.dateUtc}::date
               AND s2.display_name IS NOT NULL
             ORDER BY s2.finished_at DESC
             LIMIT 1
           ) AS display_name
    FROM scores
    WHERE date_utc = ${params.dateUtc}::date
    GROUP BY cookie_id
    ORDER BY best_score DESC, best_wrong ASC, best_finished_at ASC
    LIMIT ${limit}
  `;

  const top: LeaderboardEntry[] = topRows.map((r, i) => ({
    rank: i + 1,
    cookieId: r.cookie_id,
    bestScore: r.best_score,
    bestWrong: r.best_wrong,
    bestFinishedAt: new Date(r.best_finished_at),
    displayName: r.display_name ?? null,
  }));

  // Total players (cookies) today.
  const totalRows = await sql<{ count: string }>`
    SELECT COUNT(DISTINCT cookie_id)::text AS count
    FROM scores
    WHERE date_utc = ${params.dateUtc}::date
  `;
  const totalPlayers = parseInt(totalRows[0]?.count ?? "0", 10);

  // Your-rank: only if cookie supplied and they have a score today.
  let yourRank: number | null = null;
  let yourBestToday: number | null = null;
  if (params.cookieId) {
    const yourBestRows = await sql<{
      best_score: number;
      best_wrong: number;
      best_finished_at: Date;
    }>`
      SELECT MAX(correct_count) AS best_score,
             MIN(wrong_count) AS best_wrong,
             MIN(finished_at) AS best_finished_at
      FROM scores
      WHERE date_utc = ${params.dateUtc}::date AND cookie_id = ${params.cookieId}
    `;
    const yourBest = yourBestRows[0];
    if (yourBest && yourBest.best_score !== null) {
      yourBestToday = yourBest.best_score;
      // Rank = 1 + count of cookies whose best_per_cookie row is strictly better
      // than the caller's. Tiebreaker order matches the leaderboard ORDER BY:
      //   higher best_score, OR
      //   same best_score AND lower best_wrong, OR
      //   same best_score+best_wrong AND earlier best_finished_at.
      const rankRows = await sql<{ rank: string }>`
        SELECT COUNT(*)::text AS rank
        FROM (
          SELECT cookie_id,
                 MAX(correct_count) AS best_score,
                 MIN(wrong_count) AS best_wrong,
                 MIN(finished_at) AS best_finished_at
          FROM scores
          WHERE date_utc = ${params.dateUtc}::date
          GROUP BY cookie_id
        ) lb_strictly_better
        WHERE best_score > ${yourBest.best_score}
           OR (best_score = ${yourBest.best_score} AND best_wrong < ${yourBest.best_wrong})
           OR (best_score = ${yourBest.best_score}
               AND best_wrong = ${yourBest.best_wrong}
               AND best_finished_at < ${yourBest.best_finished_at})
      `;
      yourRank = parseInt(rankRows[0]?.rank ?? "0", 10) + 1;
    }
  }

  return { top, yourRank, yourBestToday, totalPlayers, dateUtc: params.dateUtc };
};

/**
 * All-time leaderboard. Same shape as today's, but with no date filter — the
 * pride view: a kid's 26 from last week stays visible forever.
 *
 * Tiebreakers mirror today's: correct DESC → wrong ASC → finished_at ASC.
 * display_name picks the most recent non-null name for each cookie (so a player
 * who renamed last week shows under their current name).
 */
export const getAllTimeLeaderboard = async (params: {
  cookieId: string | null;
  limit?: number;
  sql?: SqlTag;
}): Promise<AllTimeLeaderboardResult> => {
  const sql = params.sql ?? getSql();
  const limit = params.limit ?? 10;

  const topRows = await sql<{
    cookie_id: string;
    best_score: number;
    best_wrong: number;
    best_finished_at: Date;
    display_name: string | null;
  }>`
    SELECT cookie_id,
           MAX(correct_count) AS best_score,
           MIN(wrong_count) AS best_wrong,
           MIN(finished_at) AS best_finished_at,
           (
             SELECT s2.display_name
             FROM scores s2
             WHERE s2.cookie_id = scores.cookie_id
               AND s2.display_name IS NOT NULL
             ORDER BY s2.finished_at DESC
             LIMIT 1
           ) AS display_name
    FROM scores
    GROUP BY cookie_id
    ORDER BY best_score DESC, best_wrong ASC, best_finished_at ASC
    LIMIT ${limit}
  `;

  const top: LeaderboardEntry[] = topRows.map((r, i) => ({
    rank: i + 1,
    cookieId: r.cookie_id,
    bestScore: r.best_score,
    bestWrong: r.best_wrong,
    bestFinishedAt: new Date(r.best_finished_at),
    displayName: r.display_name ?? null,
  }));

  let yourRank: number | null = null;
  let yourPersonalBest: number | null = null;
  if (params.cookieId) {
    const yourBestRows = await sql<{
      best_score: number | null;
      best_wrong: number | null;
      best_finished_at: Date | null;
    }>`
      SELECT MAX(correct_count) AS best_score,
             MIN(wrong_count) AS best_wrong,
             MIN(finished_at) AS best_finished_at
      FROM scores
      WHERE cookie_id = ${params.cookieId}
    `;
    const yb = yourBestRows[0];
    if (yb && yb.best_score !== null) {
      yourPersonalBest = yb.best_score;
      const rankRows = await sql<{ rank: string }>`
        SELECT COUNT(*)::text AS rank
        FROM (
          SELECT cookie_id,
                 MAX(correct_count) AS best_score,
                 MIN(wrong_count) AS best_wrong,
                 MIN(finished_at) AS best_finished_at
          FROM scores
          GROUP BY cookie_id
        ) lb_strictly_better_alltime
        WHERE best_score > ${yb.best_score}
           OR (best_score = ${yb.best_score} AND best_wrong < ${yb.best_wrong})
           OR (best_score = ${yb.best_score}
               AND best_wrong = ${yb.best_wrong}
               AND best_finished_at < ${yb.best_finished_at})
      `;
      yourRank = parseInt(rankRows[0]?.rank ?? "0", 10) + 1;
    }
  }

  return { top, yourRank, yourPersonalBest };
};
