import { describe, it, expect } from "vitest";
import { writeScore, getLeaderboard, getAllTimeLeaderboard, sanitizeDisplayName } from "@/db/scores";
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

  it("persists playMode (denormalized from attempt per eng D6)", async () => {
    const sql = makeFakeSql([
      { match: "INSERT INTO scores", rows: [{
        id: 99, attempt_id: "att-y", cookie_id: "c", date_utc: "2026-05-01",
        correct_count: 0, wrong_count: 0, finished_at: new Date(),
        play_mode: "party",
      }] },
    ]);
    const row = await writeScore({
      attemptId: "att-y", cookieId: "c", dateUtc: "2026-05-01",
      correctCount: 0, wrongCount: 0, playMode: "party", sql,
    });
    expect(row.playMode).toBe("party");
    const insertCall = sql.__calls.find((c) => c.query.includes("INSERT INTO scores"));
    expect(insertCall?.query).toContain("play_mode");
    expect(insertCall?.params).toContain("party");
  });

  it("defaults playMode to 'solo' when caller omits it", async () => {
    const sql = makeFakeSql([
      { match: "INSERT INTO scores", rows: [{
        id: 100, attempt_id: "att-z", cookie_id: "c", date_utc: "2026-05-01",
        correct_count: 0, wrong_count: 0, finished_at: new Date(),
        play_mode: "solo",
      }] },
    ]);
    const row = await writeScore({
      attemptId: "att-z", cookieId: "c", dateUtc: "2026-05-01",
      correctCount: 0, wrongCount: 0, sql,
    });
    expect(row.playMode).toBe("solo");
    const insertCall = sql.__calls.find((c) => c.query.includes("INSERT INTO scores"));
    expect(insertCall?.params).toContain("solo");
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
    const lb = await getLeaderboard({ dateUtc: "2026-04-29", cookieId: null, playMode: "solo", sql });
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
    const lb = await getLeaderboard({ dateUtc: "2026-04-29", cookieId: "cookie-mine", playMode: "solo", sql });
    expect(lb.yourBestToday).toBe(17);
    expect(lb.yourRank).toBe(6); // 5 ahead + 1
  });

  it("handles empty leaderboard (Day 1)", async () => {
    const sql = makeFakeSql([
      { match: "GROUP BY cookie_id", rows: [] },
      { match: "DISTINCT cookie_id", rows: [{ count: "0" }] },
    ]);
    const lb = await getLeaderboard({ dateUtc: "2026-04-29", cookieId: null, playMode: "solo", sql });
    expect(lb.top).toEqual([]);
    expect(lb.totalPlayers).toBe(0);
  });

  it("respects custom limit", async () => {
    const sql = makeFakeSql([
      { match: "GROUP BY cookie_id", rows: [] },
      { match: "DISTINCT cookie_id", rows: [{ count: "0" }] },
    ]);
    await getLeaderboard({ dateUtc: "2026-04-29", cookieId: null, playMode: "solo", limit: 10, sql });
    const groupByCall = sql.__calls.find((c) => c.query.includes("GROUP BY cookie_id"));
    // Limit shows up as a parameter, not inline
    expect(groupByCall?.params).toContain(10);
  });

  it("filters today's leaderboard by playMode (DD3: solo and party are separate lists)", async () => {
    const sql = makeFakeSql([
      { match: "GROUP BY cookie_id", rows: [
        { cookie_id: "c-1", best_score: 31, best_wrong: 1, best_finished_at: new Date(), display_name: "The Smiths" },
      ] },
      { match: "DISTINCT cookie_id", rows: [{ count: "1" }] },
    ]);
    const lb = await getLeaderboard({ dateUtc: "2026-05-01", cookieId: null, playMode: "party", sql });
    expect(lb.top[0].displayName).toBe("The Smiths");
    // The query carries the playMode param
    const groupByCall = sql.__calls.find((c) => c.query.includes("GROUP BY cookie_id"));
    expect(groupByCall?.query).toContain("play_mode = ?");
    expect(groupByCall?.params).toContain("party");
  });

  it("returns displayName when present on the row", async () => {
    const sql = makeFakeSql([
      { match: "GROUP BY cookie_id", rows: [
        { cookie_id: "c-1", best_score: 10, best_wrong: 1, best_finished_at: new Date(), display_name: "Alex" },
        { cookie_id: "c-2", best_score: 8, best_wrong: 2, best_finished_at: new Date(), display_name: null },
      ] },
      { match: "DISTINCT cookie_id", rows: [{ count: "2" }] },
    ]);
    const lb = await getLeaderboard({ dateUtc: "2026-04-29", cookieId: null, playMode: "solo", sql });
    expect(lb.top[0].displayName).toBe("Alex");
    expect(lb.top[1].displayName).toBeNull();
  });
});

describe("getAllTimeLeaderboard", () => {
  it("ranks rows by best-per-cookie across all time (no date filter)", async () => {
    const sql = makeFakeSql([
      { match: "GROUP BY cookie_id\n    ORDER BY", rows: [
        { cookie_id: "c-1", best_score: 27, best_wrong: 0, best_finished_at: new Date("2026-04-22T10:00:00Z"), display_name: "Pat" },
        { cookie_id: "c-2", best_score: 24, best_wrong: 1, best_finished_at: new Date("2026-04-25T10:00:00Z"), display_name: "Sam" },
      ] },
    ]);
    const lb = await getAllTimeLeaderboard({ cookieId: null, playMode: "solo", sql });
    expect(lb.top).toHaveLength(2);
    expect(lb.top[0].rank).toBe(1);
    expect(lb.top[0].bestScore).toBe(27);
    expect(lb.top[0].displayName).toBe("Pat");
    expect(lb.yourRank).toBeNull();
    expect(lb.yourPersonalBest).toBeNull();
  });

  it("does NOT filter by date_utc (the whole point of all-time)", async () => {
    const sql = makeFakeSql([
      { match: "GROUP BY cookie_id\n    ORDER BY", rows: [] },
    ]);
    await getAllTimeLeaderboard({ cookieId: null, playMode: "solo", sql });
    const topCall = sql.__calls.find((c) => c.query.includes("GROUP BY cookie_id\n    ORDER BY"));
    // The only date_utc reference allowed is inside the display_name subquery
    // (which doesn't filter — it picks the most-recent name per cookie).
    expect(topCall?.query).not.toContain("WHERE date_utc");
  });

  it("returns yourPersonalBest + yourRank when cookie has scores", async () => {
    const sql = makeFakeSql([
      { match: "lb_strictly_better_alltime", rows: [{ rank: "3" }] },
      { match: "WHERE cookie_id = ?\n    ", rows: [{ best_score: 22, best_wrong: 1, best_finished_at: new Date("2026-04-26T10:00:00Z") }] },
      { match: "GROUP BY cookie_id\n    ORDER BY", rows: [] },
    ]);
    const lb = await getAllTimeLeaderboard({ cookieId: "cookie-mine", playMode: "solo", sql });
    expect(lb.yourPersonalBest).toBe(22);
    expect(lb.yourRank).toBe(4); // 3 ahead + 1
  });

  it("yourPersonalBest is null when cookie has no scores ever", async () => {
    const sql = makeFakeSql([
      { match: "WHERE cookie_id = ?\n    ", rows: [{ best_score: null, best_wrong: null, best_finished_at: null }] },
      { match: "GROUP BY cookie_id\n    ORDER BY", rows: [] },
    ]);
    const lb = await getAllTimeLeaderboard({ cookieId: "fresh-cookie", playMode: "solo", sql });
    expect(lb.yourPersonalBest).toBeNull();
    expect(lb.yourRank).toBeNull();
  });

  it("default limit is 10 (top 10, not top 100)", async () => {
    const sql = makeFakeSql([
      { match: "GROUP BY cookie_id\n    ORDER BY", rows: [] },
    ]);
    await getAllTimeLeaderboard({ cookieId: null, playMode: "solo", sql });
    const topCall = sql.__calls.find((c) => c.query.includes("GROUP BY cookie_id\n    ORDER BY"));
    expect(topCall?.params).toContain(10);
  });

  it("respects custom limit", async () => {
    const sql = makeFakeSql([
      { match: "GROUP BY cookie_id\n    ORDER BY", rows: [] },
    ]);
    await getAllTimeLeaderboard({ cookieId: null, playMode: "solo", limit: 25, sql });
    const topCall = sql.__calls.find((c) => c.query.includes("GROUP BY cookie_id\n    ORDER BY"));
    expect(topCall?.params).toContain(25);
  });

  it("anonymous request (no cookie) returns top + nulls for caller fields", async () => {
    const sql = makeFakeSql([
      { match: "GROUP BY cookie_id\n    ORDER BY", rows: [
        { cookie_id: "c-1", best_score: 30, best_wrong: 0, best_finished_at: new Date(), display_name: "Top" },
      ] },
    ]);
    const lb = await getAllTimeLeaderboard({ cookieId: null, playMode: "solo", sql });
    expect(lb.top).toHaveLength(1);
    expect(lb.yourRank).toBeNull();
    expect(lb.yourPersonalBest).toBeNull();
  });

  it("filters by playMode (DD3: solo and party have separate all-time lists)", async () => {
    const sql = makeFakeSql([
      { match: "GROUP BY cookie_id\n    ORDER BY", rows: [
        { cookie_id: "c-1", best_score: 31, best_wrong: 1, best_finished_at: new Date(), display_name: "The Smiths" },
      ] },
    ]);
    const lb = await getAllTimeLeaderboard({ cookieId: null, playMode: "party", sql });
    expect(lb.top[0].displayName).toBe("The Smiths");
    const topCall = sql.__calls.find((c) => c.query.includes("GROUP BY cookie_id\n    ORDER BY"));
    expect(topCall?.query).toContain("play_mode = ?");
    expect(topCall?.params).toContain("party");
  });
});

describe("sanitizeDisplayName", () => {
  it("trims whitespace", () => {
    expect(sanitizeDisplayName("  Alex  ")).toBe("Alex");
  });
  it("returns null for empty + whitespace-only input", () => {
    expect(sanitizeDisplayName("")).toBeNull();
    expect(sanitizeDisplayName("   ")).toBeNull();
  });
  it("returns null for null + undefined + non-strings", () => {
    expect(sanitizeDisplayName(null)).toBeNull();
    expect(sanitizeDisplayName(undefined)).toBeNull();
  });
  it("clamps to 30 chars", () => {
    const long = "x".repeat(50);
    expect(sanitizeDisplayName(long)).toHaveLength(30);
  });
  it("preserves middle whitespace + emoji + unicode", () => {
    expect(sanitizeDisplayName("The Smiths")).toBe("The Smiths");
    expect(sanitizeDisplayName("José 🎉")).toBe("José 🎉");
  });
});
