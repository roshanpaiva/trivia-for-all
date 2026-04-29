/**
 * POST /api/attempt/finalize { attemptId }
 *
 * Server-authoritative score finalization. Sums correct + wrong from the
 * answers table (NEVER trusts a client-reported total), marks the attempt
 * finished_at, and writes a scores row IF mode = 'scored'.
 *
 * Idempotent: a second finalize call returns the same final numbers.
 */

import { NextResponse } from "next/server";
import { findAttempt, markAttemptFinished, countScoredAttempts, DAILY_SCORED_LIMIT } from "@/db/attempts";
import { tallyAttempt } from "@/db/answers";
import { writeScore } from "@/db/scores";
import { readCookieId } from "@/lib/identity";

export const dynamic = "force-dynamic";

type Body = { attemptId?: string };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof body.attemptId !== "string") {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const cookieId = await readCookieId();
  if (!cookieId) {
    return NextResponse.json({ error: "no_cookie" }, { status: 401 });
  }

  const attempt = await findAttempt(body.attemptId);
  if (!attempt) {
    return NextResponse.json({ error: "attempt_not_found" }, { status: 404 });
  }
  if (attempt.cookieId !== cookieId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const tally = await tallyAttempt(attempt.id);

  // Mark finished. Idempotent — second call is a WHERE-clause no-op.
  await markAttemptFinished(attempt.id);

  // Write to scores table only for scored mode. Practice never lands on the leaderboard.
  if (attempt.mode === "scored") {
    await writeScore({
      attemptId: attempt.id,
      cookieId: attempt.cookieId,
      dateUtc: attempt.dateUtc,
      correctCount: tally.correctCount,
      wrongCount: tally.wrongCount,
    });
  }

  const remaining =
    attempt.mode === "scored"
      ? Math.max(0, DAILY_SCORED_LIMIT - (await countScoredAttempts(attempt.cookieId, attempt.dateUtc)))
      : DAILY_SCORED_LIMIT;

  return NextResponse.json({
    score: tally.correctCount,
    wrongCount: tally.wrongCount,
    attemptsRemaining: remaining,
    mode: attempt.mode,
  });
}
