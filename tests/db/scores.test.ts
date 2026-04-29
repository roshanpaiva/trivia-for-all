import { describe, it, expect } from "vitest";
import { writeScore, getLeaderboard } from "@/db/scores";
import { makeFakeSql } from "./_fakeSql";

describe("writeScore", () => {
  it("returns the inserted row mapped to ScoreRow shape", async () => {
    const sql = makeFakeSql([
      { match: "INSERT INTO scores", rows: [{
        id: 42,
        attempt_id: "att-x",
        cookie_id: "cookie-A",
        date_utc: "2026-04-29",
        correct_count: 17,
        wrong_count: 3,
        finished_at: new Date("2026-04-29T12:00:00Z"),
      }] },
    ]);
    const row = await writeScore({
      attemptId: "att-x",
      cookieId: "cookie-A",
      dateUtc: "2026-04-29",
      correctCount: 17,
      wrongCount: 3,
      sql,
    });
    expect(row.id).toBe(42);
    expect(row.attemptId).toBe("att-x");
    expect(row.correctCount).toBe(17);
    expect(row.wrongCount).toBe(3);
  });

  it("uses ON CONFLICT DO UPDATE for idempotency", async () => {
    const sql = makeFakeSql([
      { match: "INSERT INTO scores", rows: [{
        id: 42, attempt_id: "att-x", cookie_id: "c", date_utc: "2026-04-29",
        correct_count: 0, wrong_count: 0, finished_at: new Date(),
      }] },
    ]);
    await writeScore({
      attemptId: "att-x", cookieId: "c", dateUtc: "2026-04-29",
      correctCount: 0, wrongCount: 0, sql,
    });
    const insertCall = sql.__calls.find((c) => c.query.includes("INSERT INTO scores"));
    expect(insertCall?.query).toContain("ON CONFLICT (attempt_id) DO UPDATE");
  });
});

describe("getLeaderboard", () => {
  it("ranks rows by best-per-cookie + tiebreakers", async () => {
    const sql = makeFakeSql([
      { match: "GROUP BY cookie_id", rows: [
        { cookie_id: "c-1", best_score: 21, best_wrong: 1, best_finished_at: new Date("2026-04-29T10:00:00Z") },
        { cookie_id: "c-2", best_score: 19, best_wrong: 0, best_finished_at: new Date("2026-04-29T11:00:00Z") },
        { cookie_id: "c-3", best_score: 19, best_wrong: 2, best_finished_at: new Date("2026-04-29T09:00:00Z") },
      ] },
      { match: "DISTINCT cookie_id", rows: [{ count: "5" }] },
    ]);
    const lb = await getLeaderboard({ dateUtc: "2026-04-29", cookieId: null, sql });
    expect(lb.top).toHaveLength(3);
    expect(lb.top[0].rank).toBe(1);
    expect(lb.top[0].bestScore).toBe(21);
    expect(lb.totalPlayers).toBe(5);
    expect(lb.yourRank).toBeNull();
    expect(lb.yourBestToday).toBeNull();
  });

  it("returns yourRank + yourBestToday when cookie has scores", async () => {
    // Order matters: most-specific matchers first (the rank query contains
    // GROUP BY + WHERE date_utc, so generic matches would intercept it).
    const sql = makeFakeSql([
      { match: "lb_strictly_better", rows: [{ rank: "5" }] }, // 5 players ahead
      { match: "MAX(correct_count) AS best_score,\n             MIN(wrong_count)", rows: [{ best_score: 17, best_wrong: 2, best_finished_at: new Date() }] },
      { match: "DISTINCT cookie_id", rows: [{ count: "10" }] },
      { match: "GROUP BY cookie_id", rows: [
        { cookie_id: "c-other", best_score: 25, best_wrong: 0, best_finished_at: new Date() },
      ] },
    ]);
    const lb = await getLeaderboard({ dateUtc: "2026-04-29", cookieId: "cookie-mine", sql });
    expect(lb.yourBestToday).toBe(17);
    expect(lb.yourRank).toBe(6); // 5 ahead + 1
  });

  it("handles empty leaderboard (Day 1)", async () => {
    const sql = makeFakeSql([
      { match: "GROUP BY cookie_id", rows: [] },
      { match: "DISTINCT cookie_id", rows: [{ count: "0" }] },
    ]);
    const lb = await getLeaderboard({ dateUtc: "2026-04-29", cookieId: null, sql });
    expect(lb.top).toEqual([]);
    expect(lb.totalPlayers).toBe(0);
  });

  it("respects custom limit", async () => {
    const sql = makeFakeSql([
      { match: "GROUP BY cookie_id", rows: [] },
      { match: "DISTINCT cookie_id", rows: [{ count: "0" }] },
    ]);
    await getLeaderboard({ dateUtc: "2026-04-29", cookieId: null, limit: 10, sql });
    const groupByCall = sql.__calls.find((c) => c.query.includes("GROUP BY cookie_id"));
    // Limit shows up as a parameter, not inline
    expect(groupByCall?.params).toContain(10);
  });
});
