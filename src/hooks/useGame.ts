"use client";

/**
 * Game loop hook. Owns:
 *   - The timer reducer state (gameReducer)
 *   - The 100ms tick loop (only ticks during 'answering' phase)
 *   - The 12s soft-cap timer per question
 *   - API calls: startAttempt → submitAnswer → finalizeAttempt
 *   - Wiring useAudio to read the question prompt + speak the streak announcement
 *
 * The component renders different UI based on `state.phase` — the hook is the
 * sole owner of when those transitions happen.
 */

import { useReducer, useEffect, useRef, useCallback, useState } from "react";
import {
  gameReducer,
  initialGameState,
  type GameState,
  type GameEvent,
} from "@/lib/timer";
import {
  startAttempt as startAttemptApi,
  submitAnswerWithRetry,
  finalizeAttempt as finalizeAttemptApi,
} from "@/lib/api";
import type { AttemptMode, ClientQuestion, PlayMode } from "@/lib/types";
import { useAudio } from "./useAudio";

const TICK_INTERVAL_MS = 100;

export type UseGameReturn = {
  /** Pure timer state. */
  state: GameState;
  /** Loaded attempt + questions. Null until startGame() resolves. */
  attempt: { id: string; mode: AttemptMode; questions: ClientQuestion[] } | null;
  /** Hook lifecycle status — useful for the parent component's loading UI. */
  status: "idle" | "starting" | "playing" | "finalizing" | "finalized" | "error";
  /** Server-tallied final result, set once finalizeAttempt resolves. */
  finalScore: { score: number; wrongCount: number; attemptsRemaining: number } | null;
  /** Set when something went wrong; the UI should surface this. */
  error: string | null;
  /** True when an /api/answer call is in flight + pause overlay should show. */
  isRecovering: boolean;
  /** Caller wires this to the Start button (must be inside the click handler!).
   * `playMode` defaults to 'solo' so existing v1 callers don't need to change. */
  startGame: (mode: AttemptMode, playMode?: PlayMode) => Promise<void>;
  /** Caller wires this to choice tile taps. */
  tapChoice: (choiceIdx: number) => Promise<void>;
  /** Called when TTS finishes reading the prompt. */
  finishReading: () => void;
  /** Called when REVEAL+FACT audio finishes. */
  finishReveal: () => void;
};

export const useGame = (opts: { displayName?: string | null } = {}): UseGameReturn => {
  // Declared before useReducer so the reducer closure can read it on the first
  // dispatch — JS temporal-dead-zone would otherwise throw on initial render.
  const attemptRef = useRef<UseGameReturn["attempt"]>(null);
  // Mirror the latest displayName into a ref so the finalize effect uses the
  // current value without needing it as an effect dep (would cause double-fires).
  const displayNameRef = useRef<string | null>(opts.displayName ?? null);
  useEffect(() => {
    displayNameRef.current = opts.displayName ?? null;
  }, [opts.displayName]);

  const [state, baseDispatch] = useReducer(
    (s: GameState, e: GameEvent) => gameReducer(s, e, attemptRef.current?.questions.length ?? 0),
    initialGameState(),
  );
  const [attempt, setAttempt] = useState<UseGameReturn["attempt"]>(null);
  const [status, setStatus] = useState<UseGameReturn["status"]>("idle");
  const [finalScore, setFinalScore] = useState<UseGameReturn["finalScore"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  const audio = useAudio();

  // Mirror attempt into ref for the reducer's totalQuestions arg
  useEffect(() => {
    attemptRef.current = attempt;
  }, [attempt]);

  const dispatch = useCallback((event: GameEvent) => {
    baseDispatch(event);
  }, []);

  // === Tick loop: 100ms across every active phase ===
  // Clock pressures continuously through reading + answering + validating +
  // reveal — only paused pre-game (idle) and post-game (finished). The reducer
  // also enforces this gate.
  useEffect(() => {
    if (state.phase === "idle" || state.phase === "finished") return;
    const id = window.setInterval(() => {
      dispatch({ type: "tick", deltaMs: TICK_INTERVAL_MS });
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [state.phase, dispatch]);

  // === Soft-cap timer: 12s per question ===
  useEffect(() => {
    if (state.phase !== "answering" || state.answeringStartedAt === null) return;
    const id = window.setTimeout(() => {
      dispatch({ type: "soft-cap-elapsed" });
    }, 12_000);
    return () => window.clearTimeout(id);
  }, [state.phase, state.answeringStartedAt, dispatch]);

  // === Speak the question prompt when entering READING ===
  useEffect(() => {
    if (state.phase !== "reading" || !attempt) return;
    const q = attempt.questions[state.questionIdx];
    if (!q) return;
    audio.speak(q.prompt);
    // Don't include `audio` in deps — it's a stable ref we own
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.questionIdx, attempt]);

  // === Speak the result (and fact on correct only) when REVEAL fires ===
  useEffect(() => {
    if (state.phase !== "reveal" || !state.reveal || !attempt) return;
    if (state.reveal.streakAnnouncement === "streak-5") {
      audio.speak("Five in a row! Bonus time activated, ten extra seconds per correct answer.");
      return;
    }
    if (state.reveal.streakAnnouncement === "streak-10") {
      audio.speak("Ten in a row! You're on fire — fifteen extra seconds per correct answer now.");
      return;
    }
    // Soft-cap timeout: correctIdx is -1, no choice text to read.
    if (state.reveal.correctIdx < 0) {
      audio.speak("Out of time.");
      return;
    }
    if (state.reveal.correct) {
      // Positive reinforcement + the fact (the edutainment payload).
      const text = state.reveal.fact ? `Correct. ${state.reveal.fact}` : "Correct.";
      audio.speak(text);
      return;
    }
    // Wrong answer: name the right choice. Facts can be long and tangential —
    // the user wants the correction first and clearest.
    const correctChoice = attempt.questions[state.questionIdx]?.choices[state.reveal.correctIdx];
    audio.speak(
      correctChoice
        ? `Incorrect. The correct answer is ${correctChoice}.`
        : "Incorrect.",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.reveal, attempt, state.questionIdx]);

  // === Announce game-end (time's up / all done / brainiac) ===
  // Fires after the finalize effect's audio.cancel(); a small delay keeps the
  // cancel from clipping the start of this announcement.
  useEffect(() => {
    if (state.phase !== "finished" || !state.endReason) return;
    const correct = state.score.correctCount;
    const noun = correct === 1 ? "answer" : "answers";
    const intro =
      state.endReason === "time-out"
        ? "Time's up."
        : "Wow, you ran the table!"; // max-questions: rare celebratory case
    const id = window.setTimeout(() => {
      audio.speak(`${intro} You got ${correct} ${noun} right.`);
    }, 150);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.endReason, state.score.correctCount]);

  // === Finalize when the game ends ===
  useEffect(() => {
    if (state.phase !== "finished" || !attempt) return;
    if (status === "finalizing" || status === "finalized") return;
    setStatus("finalizing");
    audio.cancel();
    finalizeAttemptApi(attempt.id, displayNameRef.current)
      .then((result) => {
        setFinalScore({
          score: result.score,
          wrongCount: result.wrongCount,
          attemptsRemaining: result.attemptsRemaining,
        });
        setStatus("finalized");
      })
      .catch((e: Error) => {
        setError(`Finalize failed: ${e.message}`);
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, attempt, status]);

  // === Caller-driven actions ===

  const startGame = useCallback(async (mode: AttemptMode, playMode: PlayMode = "solo") => {
    if (status === "starting" || status === "playing" || status === "finalizing") return;
    setStatus("starting");
    setError(null);
    audio.unlock();
    try {
      const res = await startAttemptApi(mode, playMode);
      const next = { id: res.attemptId, mode: res.mode, questions: res.questions };
      attemptRef.current = next;
      setAttempt(next);
      setStatus("playing");
      dispatch({ type: "start" });
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "daily_limit_reached") {
        setError("daily_limit_reached");
      } else {
        setError(err.message ?? "start_failed");
      }
      // Drop back to idle so the user can retry. The error message stays in
      // `error` until the next start attempt clears it.
      setStatus("idle");
    }
  }, [status, audio, dispatch]);

  const tapChoice = useCallback(async (choiceIdx: number) => {
    if (!attempt) return;
    if (state.phase !== "reading" && state.phase !== "answering") return;
    audio.cancel(); // barge-in
    const q = attempt.questions[state.questionIdx];
    if (!q) return;

    const elapsedMs = state.answeringStartedAt !== null
      ? Date.now() - state.answeringStartedAt
      : 0;

    dispatch({ type: "tap-answer", choiceIdx, nowMs: Date.now() });

    setIsRecovering(false);
    try {
      const result = await submitAnswerWithRetry({
        attemptId: attempt.id,
        questionId: q.id,
        choiceIdx,
        clientElapsedMs: elapsedMs,
        onRetry: () => setIsRecovering(true),
      });
      setIsRecovering(false);
      dispatch({
        type: "validation-result",
        correct: result.correct,
        correctIdx: result.correctIdx,
        fact: result.fact,
      });
    } catch (e) {
      setIsRecovering(false);
      setError(`Answer failed: ${(e as Error).message}`);
    }
  }, [attempt, state.phase, state.questionIdx, state.answeringStartedAt, audio, dispatch]);

  const finishReading = useCallback(() => {
    dispatch({ type: "reading-complete", nowMs: Date.now() });
  }, [dispatch]);

  const finishReveal = useCallback(() => {
    dispatch({ type: "reveal-complete" });
  }, [dispatch]);

  return {
    state,
    attempt,
    status,
    finalScore,
    error,
    isRecovering,
    startGame,
    tapChoice,
    finishReading,
    finishReveal,
  };
};
