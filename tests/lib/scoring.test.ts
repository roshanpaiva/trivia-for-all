import { describe, it, expect } from "vitest";
import {
  initialScoreState,
  onCorrect,
  onWrong,
  gameEndReason,
  compareScoreRows,
  BASE_CLOCK_MS,
  STREAK_BONUS_5_MS,
  STREAK_BONUS_10_MS,
  MAX_CLOCK_MS,
  MAX_QUESTIONS,
} from "@/lib/scoring";
import type { ScoreRow } from "@/lib/types";

describe("initialScoreState", () => {
  it("starts at 90s with empty counts and no streak", () => {
    const s = initialScoreState();
    expect(s.clockMs).toBe(BASE_CLOCK_MS);
    expect(s.streak).toBe(0);
    expect(s.correctCount).toBe(0);
    expect(s.wrongCount).toBe(0);
  });

  it("returns a fresh object each call (no shared mutation)", () => {
    const a = initialScoreState();
    const b = initialScoreState();
    a.correctCount = 99;
    expect(b.correctCount).toBe(0);
  });
});

describe("onCorrect — streak math", () => {
  it("streak 0→1 adds no bonus, no announcement", () => {
    const r = onCorrect(initialScoreState());
    expect(r.state.streak).toBe(1);
    expect(r.state.correctCount).toBe(1);
    expect(r.state.clockMs).toBe(BASE_CLOCK_MS);
    expect(r.bonusAddedMs).toBe(0);
    expect(r.announcement).toBeNull();
  });

  it("streak 4→5 fires the streak-5 announcement and adds +10s", () => {
    let s = initialScoreState();
    for (let i = 0; i < 4; i++) s = onCorrect(s).state;
    expect(s.streak).toBe(4);
    const r = onCorrect(s);
    expect(r.state.streak).toBe(5);
    expect(r.state.clockMs).toBe(BASE_CLOCK_MS + STREAK_BONUS_5_MS);
    expect(r.bonusAddedMs).toBe(STREAK_BONUS_5_MS);
    expect(r.announcement).toBe("streak-5");
  });

  it("streak 5→6 keeps adding +10s but no second streak-5 announcement", () => {
    let s = initialScoreState();
    for (let i = 0; i < 5; i++) s = onCorrect(s).state;
    const r = onCorrect(s);
    expect(r.state.streak).toBe(6);
    expect(r.bonusAddedMs).toBe(STREAK_BONUS_5_MS);
    expect(r.announcement).toBeNull();
  });

  it("streak 9→10 fires streak-10 and adds +15s (REPLACES +10s, not stacks)", () => {
    let s = initialScoreState();
    for (let i = 0; i < 9; i++) s = onCorrect(s).state;
    expect(s.streak).toBe(9);
    const r = onCorrect(s);
    expect(r.state.streak).toBe(10);
    expect(r.bonusAddedMs).toBe(STREAK_BONUS_10_MS);
    expect(r.bonusAddedMs).not.toBe(STREAK_BONUS_5_MS + STREAK_BONUS_10_MS);
    expect(r.announcement).toBe("streak-10");
  });

  it("streak >= 10 keeps adding +15s, no further announcement", () => {
    let s = initialScoreState();
    for (let i = 0; i < 10; i++) s = onCorrect(s).state;
    const r = onCorrect(s);
    expect(r.bonusAddedMs).toBe(STREAK_BONUS_10_MS);
    expect(r.announcement).toBeNull();
  });
});

describe("onCorrect — clock cap", () => {
  it("clock is capped at MAX_CLOCK_MS even when bonus would push higher", () => {
    let s = initialScoreState();
    s.clockMs = MAX_CLOCK_MS - 5_000;
    s.streak = 9;
    const r = onCorrect(s);
    expect(r.state.clockMs).toBe(MAX_CLOCK_MS);
    expect(r.bonusAddedMs).toBe(STREAK_BONUS_10_MS);
  });

  it("at exactly MAX_CLOCK_MS, the cap holds (no overshoot)", () => {
    const s = { clockMs: MAX_CLOCK_MS, streak: 12, correctCount: 12, wrongCount: 0 };
    const r = onCorrect(s);
    expect(r.state.clockMs).toBe(MAX_CLOCK_MS);
  });
});

describe("onWrong", () => {
  it("resets streak to 0 and increments wrongCount", () => {
    let s = initialScoreState();
    for (let i = 0; i < 7; i++) s = onCorrect(s).state;
    expect(s.streak).toBe(7);
    const after = onWrong(s);
    expect(after.streak).toBe(0);
    expect(after.wrongCount).toBe(1);
    expect(after.correctCount).toBe(7); // unchanged
    expect(after.clockMs).toBe(s.clockMs); // no penalty
  });

  it("from streak 0 → still 0, wrongCount increments", () => {
    const s = initialScoreState();
    const after = onWrong(s);
    expect(after.streak).toBe(0);
    expect(after.wrongCount).toBe(1);
  });

  it("after wrong, the next correct does NOT carry the bonus from before the streak break", () => {
    let s = initialScoreState();
    for (let i = 0; i < 5; i++) s = onCorrect(s).state; // bonus active
    s = onWrong(s);
    const r = onCorrect(s);
    expect(r.bonusAddedMs).toBe(0); // streak is 1 now, no bonus
  });
});

describe("gameEndReason", () => {
  it("returns null while clock > 0 and questions < MAX_QUESTIONS", () => {
    expect(gameEndReason(initialScoreState(), 0)).toBeNull();
    expect(gameEndReason(initialScoreState(), MAX_QUESTIONS - 1)).toBeNull();
  });

  it("returns 'time-out' when clock hits 0", () => {
    const s = { clockMs: 0, streak: 0, correctCount: 0, wrongCount: 0 };
    expect(gameEndReason(s, 5)).toBe("time-out");
  });

  it("returns 'time-out' on negative clock too (defensive)", () => {
    const s = { clockMs: -100, streak: 0, correctCount: 0, wrongCount: 0 };
    expect(gameEndReason(s, 5)).toBe("time-out");
  });

  it("returns 'max-questions' at MAX_QUESTIONS even with clock remaining", () => {
    expect(gameEndReason(initialScoreState(), MAX_QUESTIONS)).toBe("max-questions");
    expect(gameEndReason(initialScoreState(), MAX_QUESTIONS + 1)).toBe("max-questions");
  });

  it("time-out takes precedence if both fire (clock at 0 AND max questions)", () => {
    const s = { clockMs: 0, streak: 0, correctCount: 0, wrongCount: 0 };
    expect(gameEndReason(s, MAX_QUESTIONS)).toBe("time-out");
  });
});

describe("compareScoreRows — leaderboard tiebreaker", () => {
  const row = (overrides: Partial<ScoreRow>): ScoreRow => ({
    scoreId: 1,
    cookieId: "cookie-a",
    dateUtc: "2026-04-28",
    correctCount: 10,
    wrongCount: 0,
    finishedAt: "2026-04-28T12:00:00Z",
    ...overrides,
  });

  it("higher correctCount wins", () => {
    const a = row({ correctCount: 15 });
    const b = row({ correctCount: 10 });
    expect(compareScoreRows(a, b)).toBeLessThan(0);
    expect(compareScoreRows(b, a)).toBeGreaterThan(0);
  });

  it("at equal correctCount, lower wrongCount wins", () => {
    const a = row({ correctCount: 12, wrongCount: 1 });
    const b = row({ correctCount: 12, wrongCount: 5 });
    expect(compareScoreRows(a, b)).toBeLessThan(0);
  });

  it("at equal correct + wrong, earlier finishedAt wins", () => {
    const a = row({ finishedAt: "2026-04-28T12:00:00Z" });
    const b = row({ finishedAt: "2026-04-28T13:00:00Z" });
    expect(compareScoreRows(a, b)).toBeLessThan(0);
  });

  it("at equal correct + wrong + finishedAt, lower scoreId wins (no random tiebreak)", () => {
    const a = row({ scoreId: 100 });
    const b = row({ scoreId: 200 });
    expect(compareScoreRows(a, b)).toBeLessThan(0);
  });

  it("two identical rows compare to 0", () => {
    const a = row({ scoreId: 50 });
    const b = row({ scoreId: 50 });
    expect(compareScoreRows(a, b)).toBe(0);
  });

  it("sort produces a stable, intuitive leaderboard order", () => {
    const rows = [
      row({ scoreId: 1, correctCount: 10, wrongCount: 2, finishedAt: "2026-04-28T12:30:00Z" }),
      row({ scoreId: 2, correctCount: 12, wrongCount: 0, finishedAt: "2026-04-28T13:00:00Z" }),
      row({ scoreId: 3, correctCount: 12, wrongCount: 1, finishedAt: "2026-04-28T12:00:00Z" }),
      row({ scoreId: 4, correctCount: 10, wrongCount: 0, finishedAt: "2026-04-28T12:00:00Z" }),
    ];
    const sorted = [...rows].sort(compareScoreRows);
    expect(sorted.map((r) => r.scoreId)).toEqual([2, 3, 4, 1]);
  });
});
