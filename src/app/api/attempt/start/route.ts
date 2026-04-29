/**
 * POST /api/attempt/start { mode: 'scored' | 'practice' }
 *
 * Mints (or reads) the cookie identity, then atomically attempts to create
 * a new attempt. Returns 429 when scored mode hits the daily limit.
 *
 * Payload shape per the design doc:
 *   { attemptId, questionIds, dateUtc, attemptsRemaining, questions }
 *
 * `questions` is the ClientQuestion[] for the attempt — correctIdx + fact stripped.
 */

import { NextResponse } from "next/server";
import { startAttempt } from "@/db/attempts";
import { getOrMintCookieId, todayUtc } from "@/lib/identity";
import type { AttemptMode } from "@/lib/types";

export const dynamic = "force-dynamic";

type Body = { mode?: AttemptMode };

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

  const mode: AttemptMode = body.mode === "practice" ? "practice" : "scored";
  const cookieId = await getOrMintCookieId();
  const dateUtc = todayUtc();

  const result = await startAttempt({ cookieId, dateUtc, mode });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, resetAtUtc: result.resetAtUtc },
      { status: 429 },
    );
  }

  return NextResponse.json({
    attemptId: result.attempt.id,
    mode: result.attempt.mode,
    questionIds: result.attempt.questionIds,
    questions: result.questions,
    dateUtc: result.attempt.dateUtc,
    attemptsRemaining: result.attemptsRemaining,
  });
}
