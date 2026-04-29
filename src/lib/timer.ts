/**
 * In-game state machine + clock reducer.
 *
 * Source of truth: design doc → "Timer & Pacing Spec".
 *
 *     READING  → ANSWERING → VALIDATING → REVEAL → NEXT
 *        │           │           │          │
 *        │           │           │          └── auto-advance after fact audio
 *        │           │           └── server response in
 *        │           └── timer counts down (only here!)
 *        └── TTS reads question; tap = barge-in (advances to VALIDATING)
 *
 * Pure functions. No setInterval — the React hook owns the tick loop and
 * dispatches `tick` events into this reducer.
 *
 * Per D2 from /plan-eng-review: client owns the clock at v1 (cookie identity
 * already cheatable, server-clock would only add API surface, not security).
 * Server stamps `client_elapsed_ms` in answer rows for telemetry only.
 */

import {
  BASE_CLOCK_MS,
  PER_QUESTION_SOFT_CAP_MS,
  initialScoreState,
  onCorrect,
  onWrong,
  gameEndReason,
  type ScoreState,
  type StreakAnnouncement,
} from "./scoring";

export type Phase =
  | "idle"
  | "reading"
  | "answering"
  | "validating"
  | "reveal"
  | "finished";

export type RevealResult = {
  correct: boolean;
  correctIdx: number;
  fact: string;
  /** Set when the streak just hit 5 or 10 — drives the audio + visual reveal. */
  streakAnnouncement: StreakAnnouncement | null;
};

export type GameState = {
  phase: Phase;
  /** Index into the attempt's questionIds array. */
  questionIdx: number;
  /** True when streak just hit a bonus threshold; drives the visual + audio. */
  score: ScoreState;
  /** Set when phase === 'answering'. ms since the answering window began. */
  answeringStartedAt: number | null;
  /** Set when the user taps a choice; cleared on the next reveal-complete.
   * Drives the "validating-this" + "reveal-wrong" tile styling so the user
   * sees which one they picked. */
  tappedChoiceIdx: number | null;
  /** Set when phase === 'reveal'. */
  reveal: RevealResult | null;
  /** Set when phase === 'finished'. */
  endReason: "time-out" | "max-questions" | null;
};

export const initialGameState = (): GameState => ({
  phase: "idle",
  questionIdx: 0,
  score: initialScoreState(),
  answeringStartedAt: null,
  tappedChoiceIdx: null,
  reveal: null,
  endReason: null,
});

export type GameEvent =
  /** Caller starts the game (audio unlocked, attempt fetched). */
  | { type: "start" }
  /** TTS finished reading the prompt (no barge-in). Begin the answering window. */
  | { type: "reading-complete"; nowMs: number }
  /** Player tapped a choice. Note `nowMs` so we can compute elapsed answer time. */
  | { type: "tap-answer"; choiceIdx: number; nowMs: number }
  /** Per-question 12s soft cap fired (no answer in time). Treat as wrong + advance. */
  | { type: "soft-cap-elapsed" }
  /** Server validation result is in. Caller passes the reveal payload + the
   *  outcome of the scoring update (correct → onCorrect, wrong → onWrong). */
  | { type: "validation-result"; correct: boolean; correctIdx: number; fact: string }
  /** REVEAL+FACT audio finished. Auto-advance to next question. */
  | { type: "reveal-complete" }
  /** Per-tick clock decrement. Only counts when phase === 'answering'. */
  | { type: "tick"; deltaMs: number }
  /** Cancel the in-progress game — used on visibility hidden + caller pause. */
  | { type: "pause" }
  /** Resume from pause. */
  | { type: "resume" };

export const gameReducer = (
  state: GameState,
  event: GameEvent,
  totalQuestions: number,
): GameState => {
  switch (event.type) {
    case "start": {
      if (state.phase !== "idle") return state;
      return { ...state, phase: "reading", questionIdx: 0 };
    }

    case "reading-complete": {
      if (state.phase !== "reading") return state;
      return { ...state, phase: "answering", answeringStartedAt: event.nowMs };
    }

    case "tap-answer": {
      // Allowed during READING (barge-in: skip to VALIDATING) or ANSWERING (normal).
      if (state.phase !== "reading" && state.phase !== "answering") return state;
      return {
        ...state,
        phase: "validating",
        answeringStartedAt: null,
        tappedChoiceIdx: event.choiceIdx,
      };
    }

    case "soft-cap-elapsed": {
      if (state.phase !== "answering") return state;
      // Soft cap counts as wrong without persisting (no server validation needed).
      const nextScore = onWrong(state.score);
      const reveal: RevealResult = {
        correct: false,
        correctIdx: -1, // unknown — caller can show "time's up" instead of a marker
        fact: "",
        streakAnnouncement: null,
      };
      const reachedEnd = gameEndReason(nextScore, state.questionIdx + 1);
      return {
        ...state,
        phase: reachedEnd ? "finished" : "reveal",
        score: nextScore,
        reveal,
        answeringStartedAt: null,
        endReason: reachedEnd,
      };
    }

    case "validation-result": {
      if (state.phase !== "validating") return state;
      const correctResult = event.correct ? onCorrect(state.score) : null;
      const nextScore = event.correct ? correctResult!.state : onWrong(state.score);
      const reveal: RevealResult = {
        correct: event.correct,
        correctIdx: event.correctIdx,
        fact: event.fact,
        streakAnnouncement: correctResult?.announcement ?? null,
      };
      const reachedEnd = gameEndReason(nextScore, state.questionIdx + 1);
      return {
        ...state,
        phase: reachedEnd ? "finished" : "reveal",
        score: nextScore,
        reveal,
        endReason: reachedEnd,
      };
    }

    case "reveal-complete": {
      if (state.phase !== "reveal") return state;
      const nextIdx = state.questionIdx + 1;
      // Defensive: if we somehow advance past the question pool, end the game.
      if (nextIdx >= totalQuestions) {
        return {
          ...state,
          phase: "finished",
          endReason: state.endReason ?? "max-questions",
          reveal: null,
          tappedChoiceIdx: null,
        };
      }
      return {
        ...state,
        phase: "reading",
        questionIdx: nextIdx,
        reveal: null,
        tappedChoiceIdx: null,
      };
    }

    case "tick": {
      // Clock pressures throughout the game — the 90s sprint counts down
      // continuously across reading, answering, validating, and reveal. Only
      // `idle` (pre-game) and `finished` (post-game) are exempt.
      if (state.phase === "idle" || state.phase === "finished") return state;
      const clockMs = Math.max(0, state.score.clockMs - event.deltaMs);
      const nextScore = { ...state.score, clockMs };
      if (clockMs <= 0) {
        return {
          ...state,
          phase: "finished",
          score: nextScore,
          answeringStartedAt: null,
          endReason: "time-out",
        };
      }
      return { ...state, score: nextScore };
    }

    case "pause": {
      // Pause is a soft state — UI freezes, clock stops ticking. No phase change
      // (we restore the same phase on resume). The hook stops dispatching ticks.
      return state;
    }

    case "resume": {
      return state;
    }

    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return state;
    }
  }
};

/**
 * Convenience: how many ms remain in the per-question soft cap, given the
 * answering started at `answeringStartedAt` and now is `nowMs`. Returns
 * 0 when phase is not 'answering' or the cap is already exceeded.
 */
export const remainingSoftCap = (
  state: GameState,
  nowMs: number,
): number => {
  if (state.phase !== "answering" || state.answeringStartedAt === null) return 0;
  const elapsed = nowMs - state.answeringStartedAt;
  return Math.max(0, PER_QUESTION_SOFT_CAP_MS - elapsed);
};

export { BASE_CLOCK_MS, PER_QUESTION_SOFT_CAP_MS };
