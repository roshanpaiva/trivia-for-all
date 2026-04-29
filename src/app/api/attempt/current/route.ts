/**
 * GET /api/attempt/current
 *
 * Returns the cookie's in-progress attempt (if any) for tab-close + resume.
 * Includes the answered count + current streak + clock state derived from
 * the answers table — the client recomputes the visible clock from there.
 *
 * Payload:
 *   { status: 'none' | 'in_progress',
 *     attemptId?, mode?, questionIds?, questions?, answeredCount?,
 *     currentStreak?, correctCount?, wrongCount? }
 */

import { NextResponse } from "next/server";
import { findCurrentAttempt } from "@/db/attempts";
import { tallyAttempt } from "@/db/answers";
import { readCookieId } from "@/lib/identity";
import { getSql } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieId = await readCookieId();
  if (!cookieId) {
    return NextResponse.json({ status: "none" as const });
  }
  const current = await findCurrentAttempt(cookieId);
  if (!current) {
    return NextResponse.json({ status: "none" as const });
  }

  const sql = getSql();
  const tally = await tallyAttempt(current.attempt.id, sql);

  // Compute current streak from per-answer rows (latest contiguous correct run).
  const streakRows = await sql<{ correct: boolean }>`
    SELECT correct
    FROM answers
    WHERE attempt_id = ${current.attempt.id}
    ORDER BY id DESC
  `;
  let currentStreak = 0;
  for (const r of streakRows) {
    if (r.correct) currentStreak += 1;
    else break;
  }

  return NextResponse.json({
    status: "in_progress" as const,
    attemptId: current.attempt.id,
    mode: current.attempt.mode,
    questionIds: current.attempt.questionIds,
    questions: current.questions,
    answeredCount: tally.totalAnswered,
    currentStreak,
    correctCount: tally.correctCount,
    wrongCount: tally.wrongCount,
  });
}
