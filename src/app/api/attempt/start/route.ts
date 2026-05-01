/**
 * POST /api/attempt/start
 *   Body: { attemptMode?: 'scored'|'practice', playMode?: 'solo'|'party',
 *           mode?: 'scored'|'practice' }   // `mode` is the legacy alias
 *
 * Mints (or reads) the cookie identity, then atomically attempts to create
 * a new attempt. Returns 429 when scored mode hits the daily limit.
 *
 * Backward compat: the old shape `{ mode }` keeps working — server reads
 * `attemptMode` first, falls back to `mode`. Lane D will switch the client
 * to the new field name; in the meantime mid-game tabs with old JS still
 * post `{ mode }` and don't break.
 *
 * Response shape:
 *   { attemptId, mode, playMode, questionIds, dateUtc, attemptsRemaining, questions }
 *   `mode` is preserved in the response (also as `attemptMode`) for the
 *   same backward-compat reason.
 *
 * `questions` is the ClientQuestion[] for the attempt — correctIdx + fact stripped.
 */

import { NextResponse } from "next/server";
import { startAttempt } from "@/db/attempts";
import { getOrMintCookieId, todayUtc } from "@/lib/identity";
import type { AttemptMode, PlayMode } from "@/lib/types";

export const dynamic = "force-dynamic";

type Body = {
  attemptMode?: AttemptMode;
  playMode?: PlayMode;
  /** Legacy alias for attemptMode. Accepted during the transition window. */
  mode?: AttemptMode;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Body must be JSON." },
      { status: 400 },
    );
  }

  // Resolve attemptMode: prefer new field name, fall back to legacy `mode`.
  // Default to 'scored' (current v1 default) when neither is present.
  const incomingAttemptMode = body.attemptMode ?? body.mode;
  const mode: AttemptMode = incomingAttemptMode === "practice" ? "practice" : "scored";

  // Default playMode to 'solo' so legacy clients (Lane D not yet shipped)
  // keep working unchanged.
  const playMode: PlayMode = body.playMode === "party" ? "party" : "solo";

  const cookieId = await getOrMintCookieId();
  const dateUtc = todayUtc();
  // v2 telemetry: capture User-Agent so we can answer "did Android Chrome
  // work?" / "what % of party attempts were on iOS Safari?" from the data
  // alone. Truncated server-side in startAttempt before INSERT.
  const userAgent = req.headers.get("user-agent");

  const result = await startAttempt({ cookieId, dateUtc, mode, playMode, userAgent });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, resetAtUtc: result.resetAtUtc },
      { status: 429 },
    );
  }

  return NextResponse.json({
    attemptId: result.attempt.id,
    // Both names returned: legacy clients read `mode`, new clients read `attemptMode`.
    mode: result.attempt.mode,
    attemptMode: result.attempt.mode,
    playMode: result.attempt.playMode,
    questionIds: result.attempt.questionIds,
    questions: result.questions,
    dateUtc: result.attempt.dateUtc,
    attemptsRemaining: result.attemptsRemaining,
  });
}
