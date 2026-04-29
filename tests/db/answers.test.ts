import { describe, it, expect, beforeEach } from "vitest";
import { recordAnswer, tallyAttempt } from "@/db/answers";
import { __resetBankForTests } from "@/db/questions";
import { makeFakeSql } from "./_fakeSql";
import type { Question } from "@/lib/types";

const Q: Question = {
  id: "q-canberra",
  category: "geography",
  difficulty: "medium",
  prompt: "What is the capital of Australia?",
  choices: ["Sydney", "Canberra", "Melbourne", "Perth"],
  correctIdx: 1,
  fact: "Canberra was chosen as a compromise between Sydney and Melbourne.",
};

const fakeSqlWithBankAndQ = (extraMatches: { match: string; rows: unknown[] }[] = []) =>
  makeFakeSql([
    { match: "FROM questions", rows: [{
      id: Q.id, category: Q.category, difficulty: Q.difficulty,
      prompt: Q.prompt, choices: Q.choices, correct_idx: Q.correctIdx,
      fact: Q.fact, source: null,
    }] },
    ...extraMatches,
  ]);

describe("recordAnswer", () => {
  beforeEach(() => {
    __resetBankForTests();
  });

  it("returns correct=true and writes a row when choice matches correctIdx", async () => {
    const sql = fakeSqlWithBankAndQ([
      { match: "SELECT id, attempt_id", rows: [] }, // no existing answer
      { match: "INSERT INTO answers", rows: [] },
    ]);
    const r = await recordAnswer({
      attemptId: "att-1",
      questionId: Q.id,
      choiceIdx: 1,
      attemptQuestionIds: [Q.id, "other-q"],
      sql,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.correct).toBe(true);
    expect(r.correctIdx).toBe(1);
    expect(r.fact).toBe(Q.fact);
    expect(r.isDuplicate).toBe(false);
  });

  it("returns correct=false when choice differs from correctIdx", async () => {
    const sql = fakeSqlWithBankAndQ([
      { match: "SELECT id, attempt_id", rows: [] },
      { match: "INSERT INTO answers", rows: [] },
    ]);
    const r = await recordAnswer({
      attemptId: "att-1",
      questionId: Q.id,
      choiceIdx: 0, // Sydney — wrong
      attemptQuestionIds: [Q.id],
      sql,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.correct).toBe(false);
    expect(r.correctIdx).toBe(1);
    expect(r.fact).toBe(Q.fact);
  });

  it("rejects choiceIdx outside [0, 3]", async () => {
    const sql = fakeSqlWithBankAndQ();
    const tooHigh = await recordAnswer({
      attemptId: "att-1", questionId: Q.id, choiceIdx: 4, attemptQuestionIds: [Q.id], sql,
    });
    expect(tooHigh.ok).toBe(false);
    if (tooHigh.ok) return;
    expect(tooHigh.reason).toBe("invalid_choice");

    const negative = await recordAnswer({
      attemptId: "att-1", questionId: Q.id, choiceIdx: -1, attemptQuestionIds: [Q.id], sql,
    });
    expect(negative.ok).toBe(false);
  });

  it("rejects answers for questions not in the attempt", async () => {
    const sql = fakeSqlWithBankAndQ();
    const r = await recordAnswer({
      attemptId: "att-1", questionId: Q.id, choiceIdx: 1,
      attemptQuestionIds: ["other-q"], // Q.id not in attempt
      sql,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("question_not_in_attempt");
  });

  it("idempotent: duplicate answer returns the original without re-inserting", async () => {
    const existing = {
      id: 99,
      attempt_id: "att-1",
      question_id: Q.id,
      choice_idx: 0,
      correct: false,
      client_elapsed_ms: null,
      created_at: new Date(),
    };
    const sql = fakeSqlWithBankAndQ([
      { match: "SELECT id, attempt_id", rows: [existing] },
    ]);
    const r = await recordAnswer({
      attemptId: "att-1",
      questionId: Q.id,
      choiceIdx: 1, // user retries with the right answer — but original was wrong
      attemptQuestionIds: [Q.id],
      sql,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.correct).toBe(false); // first answer wins
    expect(r.isDuplicate).toBe(true);
    // No INSERT call should have been made
    const insertCall = sql.__calls.find((c) => c.query.includes("INSERT INTO answers"));
    expect(insertCall).toBeUndefined();
  });

  it("returns 'question_not_in_attempt' when bank lookup misses", async () => {
    // Question in attemptQuestionIds but no longer in bank
    const sql = makeFakeSql([
      { match: "FROM questions", rows: [] }, // empty bank
    ]);
    const r = await recordAnswer({
      attemptId: "att-1", questionId: "ghost", choiceIdx: 0,
      attemptQuestionIds: ["ghost"], sql,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("question_not_in_attempt");
  });
});

describe("tallyAttempt", () => {
  it("sums correct and wrong from per-answer rows", async () => {
    const sql = makeFakeSql([
      { match: "FROM answers", rows: [
        { correct: true, total: "12" },
        { correct: false, total: "3" },
      ] },
    ]);
    const t = await tallyAttempt("att-x", sql);
    expect(t.correctCount).toBe(12);
    expect(t.wrongCount).toBe(3);
    expect(t.totalAnswered).toBe(15);
  });

  it("returns zeros when no answers", async () => {
    const sql = makeFakeSql([{ match: "FROM answers", rows: [] }]);
    const t = await tallyAttempt("att-x", sql);
    expect(t).toEqual({ correctCount: 0, wrongCount: 0, totalAnswered: 0 });
  });
});
