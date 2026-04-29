/**
 * POST /api/answer { attemptId, questionId, choiceIdx, clientElapsedMs? }
 *
 * Server-authoritative validation. Verifies the cookie owns the attempt,
 * checks the question is part of the attempt, validates the choice,
 * persists the answer, returns { correct, correctIdx, fact }.
 *
 * Idempotent: a duplicate answer for the same (attemptId, questionId) returns
 * the original recorded answer rather than double-counting.
 */

import { NextResponse } from "next/server";
import { findAttempt } from "@/db/attempts";
import { recordAnswer } from "@/db/answers";
import { readCookieId } from "@/lib/identity";

export const dynamic = "force-dynamic";

type Body = {
  attemptId?: string;
  questionId?: string;
  choiceIdx?: number;
  clientElapsedMs?: number;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (
    typeof body.attemptId !== "string" ||
    typeof body.questionId !== "string" ||
    typeof body.choiceIdx !== "number"
  ) {
    return NextResponse.json(
      { error: "missing_fields", message: "attemptId, questionId, choiceIdx are required." },
      { status: 400 },
    );
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
  if (attempt.finishedAt !== null) {
    return NextResponse.json({ error: "attempt_finalized" }, { status: 409 });
  }

  const result = await recordAnswer({
    attemptId: body.attemptId,
    questionId: body.questionId,
    choiceIdx: body.choiceIdx,
    clientElapsedMs: body.clientElapsedMs,
    attemptQuestionIds: attempt.questionIds,
  });

  if (!result.ok) {
    const status = result.reason === "attempt_not_found" ? 404 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({
    correct: result.correct,
    correctIdx: result.correctIdx,
    fact: result.fact,
    isDuplicate: result.isDuplicate,
  });
}
