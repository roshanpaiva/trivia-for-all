/**
 * Scoring formula and leaderboard tiebreaker for the 120-second sprint.
 *
 * Pure functions. No side effects. The state machine that owns these is in the
 * UI layer (timer + game loop); these functions just produce next-state from
 * current-state given an event.
 *
 * Source of truth: design doc → "Scoring Formula" section.
 *
 *     CLOCK
 *     ├── BASE_CLOCK_MS = 120s
 *     ├── streak >= 5  → +10s per correct
 *     ├── streak >= 10 → +15s per correct (REPLACES +10s, does NOT stack)
 *     ├── wrong → streak resets to 0, no clock penalty
 *     └── capped at MAX_CLOCK_MS = 240s, max 20 questions
 *
 * Final score = correctCount. Tiebreakers (in order):
 *   correctCount DESC, wrongCount ASC, finishedAt ASC, scoreId ASC.
 */

import type { ScoreRow } from "./types";

export const BASE_CLOCK_MS = 120_000;
export const STREAK_BONUS_5_MS = 10_000;
export const STREAK_BONUS_10_MS = 15_000;
export const MAX_CLOCK_MS = 240_000;
export const MAX_QUESTIONS = 100;
export const PER_QUESTION_SOFT_CAP_MS = 12_000;

/** The streak threshold that triggers a bonus reveal (audio + visual). */
export const STREAK_TRIGGER_5 = 5;
export const STREAK_TRIGGER_10 = 10;

export type ScoreState = {
  clockMs: number;
  streak: number;
  correctCount: number;
  wrongCount: number;
};

export type StreakAnnouncement = "streak-5" | "streak-10";

export type CorrectResult = {
  state: ScoreState;
  /** Non-null when the streak just crossed 5 or 10 — fires the audio + visual reveal. */
  announcement: StreakAnnouncement | null;
  /** Bonus ms added on this answer (0, 10000, or 15000). Useful for the "+10s" animation. */
  bonusAddedMs: number;
};

/** Initial state at the start of an attempt. */
export const initialScoreState = (): ScoreState => ({
  clockMs: BASE_CLOCK_MS,
  streak: 0,
  correctCount: 0,
  wrongCount: 0,
});

/**
 * Apply a correct answer. Returns the next state plus any streak announcement.
 *
 * Streak math (replaces, does NOT stack):
 *   streak in [5, 9]  → +10000 ms
 *   streak >= 10      → +15000 ms
 */
export const onCorrect = (state: ScoreState): CorrectResult => {
  const streak = state.streak + 1;
  const correctCount = state.correctCount + 1;

  const bonusAddedMs =
    streak >= STREAK_TRIGGER_10
      ? STREAK_BONUS_10_MS
      : streak >= STREAK_TRIGGER_5
        ? STREAK_BONUS_5_MS
        : 0;

  const clockMs = Math.min(state.clockMs + bonusAddedMs, MAX_CLOCK_MS);

  let announcement: StreakAnnouncement | null = null;
  if (streak === STREAK_TRIGGER_5) announcement = "streak-5";
  else if (streak === STREAK_TRIGGER_10) announcement = "streak-10";

  return {
    state: { ...state, clockMs, streak, correctCount },
    announcement,
    bonusAddedMs,
  };
};

/**
 * Apply a wrong answer. Streak resets to 0; no clock penalty (the implicit
 * penalty is the loss of bonus on the next correct).
 */
export const onWrong = (state: ScoreState): ScoreState => ({
  ...state,
  streak: 0,
  wrongCount: state.wrongCount + 1,
});

/**
 * Game-end check. Returns the reason if the game should end, or null if it
 * should continue. Caller checks BEFORE asking the next question.
 */
export const gameEndReason = (
  state: ScoreState,
  questionsAsked: number,
): "time-out" | "max-questions" | null => {
  if (state.clockMs <= 0) return "time-out";
  if (questionsAsked >= MAX_QUESTIONS) return "max-questions";
  return null;
};

/**
 * Leaderboard tiebreaker comparator. Use as `.sort(compareScoreRows)`.
 *
 * Order:
 *   1. Higher correctCount wins
 *   2. Lower wrongCount wins
 *   3. Earlier finishedAt wins (faster finish at same accuracy)
 *   4. Lower scoreId wins (auto-increment, guarantees stable order — no random tiebreak)
 */
export const compareScoreRows = (a: ScoreRow, b: ScoreRow): number => {
  if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
  if (a.wrongCount !== b.wrongCount) return a.wrongCount - b.wrongCount;

  const ad = new Date(a.finishedAt).getTime();
  const bd = new Date(b.finishedAt).getTime();
  if (ad !== bd) return ad - bd;

  return a.scoreId - b.scoreId;
};
