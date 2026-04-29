/**
 * Answers service. Owns per-question answer validation + persistence.
 *
 * Server-authoritative validation: client POSTs choiceIdx, server compares
 * against the canonical Question.correctIdx (which never travels to the
 * client until reveal). The server returns { correct, correctIdx, fact }.
 */

import { findQuestion } from "./questions";
import type { SqlTag } from "./client";
import { getSql } from "./client";

export type AnswerResult =
  | { ok: true; correct: boolean; correctIdx: number; fact: string; isDuplicate: boolean }
  | { ok: false; reason: "attempt_not_found" | "question_not_in_attempt" | "invalid_choice" };

type AnswerRow = {
  id: number;
  attempt_id: string;
  question_id: string;
  choice_idx: number;
  correct: boolean;
  client_elapsed_ms: number | null;
  created_at: Date;
};

/**
 * Record an answer for an attempt. Validates that:
 *  1. The attempt exists (caller already verified ownership via cookie)
 *  2. The question is part of the attempt's questionIds (no answering questions
 *     not in the attempt)
 *  3. The choiceIdx is in [0, 3]
 *
 * Returns { correct, correctIdx, fact } so the route can ship the reveal payload
 * to the client.
 *
 * The `isDuplicate` flag is true when this question already had an answer for
 * this attempt — we don't double-count in the score; the first answer wins. This
 * makes /api/answer idempotent against client retries.
 */
export const recordAnswer = async (params: {
  attemptId: string;
  questionId: string;
  choiceIdx: number;
  clientElapsedMs?: number;
  attemptQuestionIds: string[];
  sql?: SqlTag;
}): Promise<AnswerResult> => {
  const sql = params.sql ?? getSql();

  if (params.choiceIdx < 0 || params.choiceIdx > 3) {
    return { ok: false, reason: "invalid_choice" };
  }
  if (!params.attemptQuestionIds.includes(params.questionId)) {
    return { ok: false, reason: "question_not_in_attempt" };
  }

  const question = await findQuestion(params.questionId, sql);
  if (!question) {
    // Question id was in the attempt's questionIds at start time, but the row
    // is gone from the bank. Extremely unlikely (would mean the bank was edited
    // mid-attempt). Treat as malformed.
    return { ok: false, reason: "question_not_in_attempt" };
  }

  // Idempotency: if this attempt already answered this question, return the
  // recorded answer without inserting again. Client retries on network blips
  // are safe.
  const existing = await sql<AnswerRow>`
    SELECT id, attempt_id, question_id, choice_idx, correct, client_elapsed_ms, created_at
    FROM answers
    WHERE attempt_id = ${params.attemptId} AND question_id = ${params.questionId}
    LIMIT 1
  `;
  if (existing.length > 0) {
    return {
      ok: true,
      correct: existing[0].correct,
      correctIdx: question.correctIdx,
      fact: question.fact,
      isDuplicate: true,
    };
  }

  const isCorrect = params.choiceIdx === question.correctIdx;
  await sql`
    INSERT INTO answers (attempt_id, question_id, choice_idx, correct, client_elapsed_ms)
    VALUES (
      ${params.attemptId},
      ${params.questionId},
      ${params.choiceIdx},
      ${isCorrect},
      ${params.clientElapsedMs ?? null}
    )
  `;

  return {
    ok: true,
    correct: isCorrect,
    correctIdx: question.correctIdx,
    fact: question.fact,
    isDuplicate: false,
  };
};

/**
 * Sum the correct + wrong counts for an attempt. Used by finalize() to compute
 * the authoritative score from per-answer rows (never trusts client-reported totals).
 */
export const tallyAttempt = async (
  attemptId: string,
  sql: SqlTag = getSql(),
): Promise<{ correctCount: number; wrongCount: number; totalAnswered: number }> => {
  const rows = await sql<{ correct: boolean; total: string }>`
    SELECT correct, COUNT(*)::text AS total
    FROM answers
    WHERE attempt_id = ${attemptId}
    GROUP BY correct
  `;
  let correctCount = 0;
  let wrongCount = 0;
  for (const r of rows) {
    if (r.correct) correctCount = parseInt(r.total, 10);
    else wrongCount = parseInt(r.total, 10);
  }
  return { correctCount, wrongCount, totalAnswered: correctCount + wrongCount };
};
