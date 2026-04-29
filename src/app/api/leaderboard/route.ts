/**
 * GET /api/leaderboard
 *
 * Today's leaderboard, top 100 by best-score-per-cookie. Includes the caller's
 * rank if they have a score today.
 *
 * Anonymous request (no cookie) is fine — yourRank/yourBestToday come back null.
 */

import { NextResponse } from "next/server";
import { getLeaderboard } from "@/db/scores";
import { countScoredAttempts, DAILY_SCORED_LIMIT } from "@/db/attempts";
import { readCookieId, todayUtc } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieId = await readCookieId();
  const dateUtc = todayUtc();

  const [result, scoredCount] = await Promise.all([
    getLeaderboard({ dateUtc, cookieId, limit: 100 }),
    cookieId ? countScoredAttempts(cookieId, dateUtc) : Promise.resolve(0),
  ]);

  // The Home page hits this endpoint on mount, so it's the natural place to
  // include the caller's remaining daily attempts. Saves a separate /api/me
  // round trip and keeps the count truthful on first paint.
  const yourAttemptsRemaining = cookieId
    ? Math.max(0, DAILY_SCORED_LIMIT - scoredCount)
    : DAILY_SCORED_LIMIT;

  return NextResponse.json({
    top: result.top.map((e) => ({
      rank: e.rank,
      // Prefer the player-supplied display name; fall back to the deterministic
      // auto-handle for older rows (pre-name-capture) or skipped names.
      handle: e.displayName ?? anonymizeCookieId(e.cookieId),
      isYou: cookieId !== null && e.cookieId === cookieId,
      bestScore: e.bestScore,
      bestWrong: e.bestWrong,
    })),
    yourRank: result.yourRank,
    yourBestToday: result.yourBestToday,
    yourAttemptsRemaining,
    totalPlayers: result.totalPlayers,
    dateUtc: result.dateUtc,
  });
}

/**
 * Convert a cookie UUID into a stable two-word handle. The fallback when the
 * player hasn't supplied a display name yet (or is on a pre-name-capture row).
 *
 * v2 with auth: this becomes the seed for an avatar / fallback display only.
 */
const ADJECTIVES = [
  "cobalt", "amber", "quiet", "brisk", "tall", "soft", "dark", "slow",
  "swift", "calm", "bright", "kind", "wise", "quick", "still", "clear",
];
const NOUNS = [
  "otter", "piano", "river", "fox", "magnet", "violet", "anchor", "citrus",
  "lantern", "harbor", "compass", "meadow", "cipher", "garden", "ember", "echo",
];

const anonymizeCookieId = (cookieId: string): string => {
  // FNV-1a hash of the cookie id, deterministic.
  let hash = 0x811c9dc5;
  for (let i = 0; i < cookieId.length; i++) {
    hash = (hash ^ cookieId.charCodeAt(i)) >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const adj = ADJECTIVES[hash % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(hash / ADJECTIVES.length) % NOUNS.length];
  return `${adj}-${noun}`;
};
