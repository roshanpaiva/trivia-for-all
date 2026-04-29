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
import { readCookieId, todayUtc } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieId = await readCookieId();
  const dateUtc = todayUtc();

  const result = await getLeaderboard({ dateUtc, cookieId, limit: 100 });

  return NextResponse.json({
    top: result.top.map((e) => ({
      rank: e.rank,
      // Anonymize cookie IDs for the public leaderboard. Future: replace with
      // chosen username from the name input modal (D9, lands with components).
      handle: anonymizeCookieId(e.cookieId),
      bestScore: e.bestScore,
      bestWrong: e.bestWrong,
    })),
    yourRank: result.yourRank,
    yourBestToday: result.yourBestToday,
    totalPlayers: result.totalPlayers,
    dateUtc: result.dateUtc,
  });
}

/**
 * Convert a cookie UUID into a stable two-word handle. The wireframe shows
 * "cobalt-otter" style names — until the name input modal (D9) lands, this
 * derives a deterministic handle from the cookie hash so the leaderboard is
 * never bare hex.
 *
 * v2 with auth: replace this with the user's chosen display name.
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
