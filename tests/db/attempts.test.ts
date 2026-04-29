import { describe, it, expect, beforeEach } from "vitest";
import {
  startAttempt,
  findAttempt,
  countScoredAttempts,
  markAttemptFinished,
  DAILY_SCORED_LIMIT,
} from "@/db/attempts";
import { __resetBankForTests } from "@/db/questions";
import { makeFakeSql } from "./_fakeSql";
import type { Question } from "@/lib/types";

const sampleBank = (): Question[] => {
  const out: Question[] = [];
  for (const diff of ["easy", "medium", "hard"] as const) {
    const count = diff === "easy" ? 30 : diff === "medium" ? 30 : 20;
    for (let i = 0; i < count; i++) {
      out.push({
        id: `${diff}-${i}`,
        category: "general",
        difficulty: diff,
        prompt: `Prompt ${diff} ${i}`,
        choices: ["A", "B", "C", "D"],
        correctIdx: 0,
        fact: `Fact ${diff} ${i}`,
      });
    }
  }
  return out;
};

const cookieId = "cookie-A";
const dateUtc = "2026-04-29";

describe("startAttempt", () => {
  beforeEach(() => {
    __resetBankForTests();
  });

  it("scored mode under the cap inserts and returns the attempt + questions", async () => {
    const bank = sampleBank();
    const insertedAttempt = {
      id: "att-1",
      cookie_id: cookieId,
      date_utc: dateUtc,
      mode: "scored",
      started_at: new Date(),
      finished_at: null,
      question_ids: bank.slice(0, 20).map((q) => q.id),
    };

    const sql = makeFakeSql([
      { match: "FROM questions", rows: bank.map((q) => ({
        id: q.id, category: q.category, difficulty: q.difficulty,
        prompt: q.prompt, choices: q.choices, correct_idx: q.correctIdx,
        fact: q.fact, source: q.source ?? null,
      })) },
      { match: "INSERT INTO attempts", rows: [insertedAttempt] },
      { match: "SELECT COUNT(*)", rows: [{ count: "1" }] },
    ]);

    const result = await startAttempt({ cookieId, dateUtc, mode: "scored", sql });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempt.id).toBe("att-1");
    expect(result.attempt.mode).toBe("scored");
    expect(result.attempt.questionIds).toHaveLength(20);
    expect(result.questions).toHaveLength(20);
    // ClientQuestion shape — correctIdx and fact stripped
    expect(result.questions[0]).not.toHaveProperty("correctIdx");
    expect(result.questions[0]).not.toHaveProperty("fact");
    expect(result.attemptsRemaining).toBe(DAILY_SCORED_LIMIT - 1);
  });

  it("scored mode at the cap returns daily_limit_reached with resetAtUtc", async () => {
    const bank = sampleBank();
    const sql = makeFakeSql([
      { match: "FROM questions", rows: bank.map((q) => ({
        id: q.id, category: q.category, difficulty: q.difficulty,
        prompt: q.prompt, choices: q.choices, correct_idx: q.correctIdx,
        fact: q.fact, source: q.source ?? null,
      })) },
      // The conditional INSERT returns NO rows when the count is already at the cap
      { match: "INSERT INTO attempts", rows: [] },
    ]);

    const result = await startAttempt({ cookieId, dateUtc, mode: "scored", sql });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("daily_limit_reached");
    expect(result.resetAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO datetime
  });

  it("practice mode is unconditional — no cap check", async () => {
    const bank = sampleBank();
    const insertedAttempt = {
      id: "att-practice-1",
      cookie_id: cookieId,
      date_utc: dateUtc,
      mode: "practice",
      started_at: new Date(),
      finished_at: null,
      question_ids: bank.slice(0, 20).map((q) => q.id),
    };

    const sql = makeFakeSql([
      { match: "FROM questions", rows: bank.map((q) => ({
        id: q.id, category: q.category, difficulty: q.difficulty,
        prompt: q.prompt, choices: q.choices, correct_idx: q.correctIdx,
        fact: q.fact, source: q.source ?? null,
      })) },
      { match: "INSERT INTO attempts", rows: [insertedAttempt] },
    ]);

    const result = await startAttempt({ cookieId, dateUtc, mode: "practice", sql });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempt.mode).toBe("practice");
    expect(result.attemptsRemaining).toBe(DAILY_SCORED_LIMIT);
    // Practice insert shouldn't include the COUNT(*) WHERE clause
    const insertCall = sql.__calls.find((c) => c.query.includes("INSERT INTO attempts"));
    expect(insertCall?.query.includes("VALUES")).toBe(true);
    expect(insertCall?.query.includes("SELECT")).toBe(false);
  });

  it("the scored INSERT statement contains the count WHERE filter (concurrent-race fix)", async () => {
    const bank = sampleBank();
    const sql = makeFakeSql([
      { match: "FROM questions", rows: bank.map((q) => ({
        id: q.id, category: q.category, difficulty: q.difficulty,
        prompt: q.prompt, choices: q.choices, correct_idx: q.correctIdx,
        fact: q.fact, source: q.source ?? null,
      })) },
      { match: "INSERT INTO attempts", rows: [] }, // simulate cap reached
    ]);

    await startAttempt({ cookieId, dateUtc, mode: "scored", sql });
    const insertCall = sql.__calls.find((c) => c.query.includes("INSERT INTO attempts"));
    // The fix: count + insert in one statement
    expect(insertCall?.query).toContain("INSERT INTO attempts");
    expect(insertCall?.query).toContain("SELECT COUNT(*)");
    expect(insertCall?.query).toContain("WHERE");
  });
});

describe("countScoredAttempts", () => {
  it("returns the row count", async () => {
    const sql = makeFakeSql([
      { match: "SELECT COUNT(*)", rows: [{ count: "3" }] },
    ]);
    const n = await countScoredAttempts(cookieId, dateUtc, sql);
    expect(n).toBe(3);
  });

  it("returns 0 when no rows", async () => {
    const sql = makeFakeSql([
      { match: "SELECT COUNT(*)", rows: [] },
    ]);
    const n = await countScoredAttempts(cookieId, dateUtc, sql);
    expect(n).toBe(0);
  });
});

describe("findAttempt", () => {
  it("returns the attempt when found", async () => {
    const sql = makeFakeSql([
      { match: "FROM attempts", rows: [{
        id: "att-x",
        cookie_id: cookieId,
        date_utc: dateUtc,
        mode: "scored",
        started_at: new Date(),
        finished_at: null,
        question_ids: ["q1", "q2"],
      }] },
    ]);
    const att = await findAttempt("att-x", sql);
    expect(att?.id).toBe("att-x");
    expect(att?.cookieId).toBe(cookieId);
    expect(att?.questionIds).toEqual(["q1", "q2"]);
  });

  it("returns null when not found", async () => {
    const sql = makeFakeSql([{ match: "FROM attempts", rows: [] }]);
    const att = await findAttempt("missing", sql);
    expect(att).toBeNull();
  });
});

describe("markAttemptFinished", () => {
  it("issues an UPDATE only when finished_at IS NULL (idempotent)", async () => {
    const sql = makeFakeSql([{ match: "UPDATE attempts", rows: [] }]);
    await markAttemptFinished("att-x", sql);
    const updateCall = sql.__calls.find((c) => c.query.includes("UPDATE attempts"));
    expect(updateCall).toBeDefined();
    expect(updateCall?.query).toContain("WHERE id =");
    expect(updateCall?.query).toContain("finished_at IS NULL");
  });
});
