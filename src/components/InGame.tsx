"use client";

/**
 * In-game screen — renders the current phase from useGame().
 * Phase rendering logic per D7 from /plan-design-review.
 */

import { useEffect } from "react";
import type { ClientQuestion } from "@/lib/types";
import { Clock } from "./Clock";
import { ChoiceTile, type ChoiceState } from "./ChoiceTile";
import { StreakDots } from "./StreakDots";
import { AudioWaveform } from "./AudioWaveform";
import { PauseOverlay } from "./PauseOverlay";
import type { GameState } from "@/lib/timer";

type Props = {
  state: GameState;
  question: ClientQuestion;
  questionNumber: number;
  totalQuestions: number;
  audioActive: boolean;
  isRecovering: boolean;
  onTapChoice: (choiceIdx: number) => void;
  onFinishReading: () => void;
  onFinishReveal: () => void;
};

const choiceStateFor = (
  phase: GameState["phase"],
  reveal: GameState["reveal"],
  choiceIdx: number,
  tappedChoiceIdx: number | null,
): ChoiceState => {
  if (phase === "reading") return "reading";
  if (phase === "answering") return "answering";
  if (phase === "validating") {
    return choiceIdx === tappedChoiceIdx ? "validating-this" : "validating-other";
  }
  if (phase === "reveal" && reveal) {
    if (choiceIdx === reveal.correctIdx) return "reveal-correct";
    if (choiceIdx === tappedChoiceIdx && !reveal.correct) return "reveal-wrong";
    return "reveal-other";
  }
  return "answering"; // default fallback
};

export const InGame = ({
  state,
  question,
  questionNumber,
  totalQuestions,
  audioActive,
  isRecovering,
  onTapChoice,
  onFinishReading,
  onFinishReveal,
}: Props) => {
  // Tapped choice is tracked in GameState (set on tap-answer, cleared on
  // reveal-complete). Drives validating-this + reveal-wrong styling.
  const tappedChoiceIdx = state.tappedChoiceIdx;

  // Keyboard nav: 1-4 keys map to choices (per CLAUDE.md a11y baseline)
  useEffect(() => {
    if (state.phase !== "answering" && state.phase !== "reading") return;
    const handler = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4) {
        e.preventDefault();
        onTapChoice(n - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.phase, onTapChoice]);

  // Auto-advance reveal: scale the timer to whatever's being read aloud so the
  // fact (or streak announcement) finishes before the next question barge-cancels
  // the speech. Same ~70ms/char + 1.5s padding heuristic as the reading phase,
  // with a 3.5s floor (short facts shouldn't feel rushed) and a 14s ceiling
  // (don't stall the game on an unusually long fact).
  useEffect(() => {
    if (state.phase !== "reveal" || !state.reveal) return;
    // Mirror useGame's reveal-speak logic so the auto-advance gives the audio
    // enough time to finish without leaving dead air on short utterances.
    let spoken: string;
    if (state.reveal.streakAnnouncement === "streak-5") {
      spoken = "Five in a row! Bonus time activated, ten extra seconds per correct answer.";
    } else if (state.reveal.streakAnnouncement === "streak-10") {
      spoken = "Ten in a row! You're on fire — fifteen extra seconds per correct answer now.";
    } else if (state.reveal.correctIdx < 0) {
      spoken = "Out of time.";
    } else if (state.reveal.correct) {
      spoken = state.reveal.fact ? `Correct. ${state.reveal.fact}` : "Correct.";
    } else {
      const correctChoice = question.choices[state.reveal.correctIdx];
      spoken = correctChoice
        ? `Incorrect. The correct answer is ${correctChoice}.`
        : "Incorrect.";
    }
    // Tuned for the 1.1× TTS rate (set in src/lib/audio.ts) plus user feedback
    // that the inter-question gap felt long. ~55ms/char ≈ 1090 wpm/1.1×, plus
    // a 500ms tail beat after speech ends. 2500ms floor keeps "Correct." from
    // feeling rushed; 12000ms ceiling caps unusually long facts.
    const ms = Math.min(12_000, Math.max(2_500, spoken.length * 55 + 500));
    const id = window.setTimeout(onFinishReveal, ms);
    return () => window.clearTimeout(id);
  }, [state.phase, state.reveal, question.choices, onFinishReveal]);

  // Auto-finish reading: TTS would normally fire onend. As a fallback in case
  // the audio service isn't speaking (browser issue), finish reading after a
  // proportional time. ~70ms per character + 1s padding.
  useEffect(() => {
    if (state.phase !== "reading") return;
    const charCount = question.prompt.length;
    const ms = Math.min(8000, Math.max(2500, charCount * 70 + 1000));
    const id = window.setTimeout(onFinishReading, ms);
    return () => window.clearTimeout(id);
  }, [state.phase, question.prompt, onFinishReading]);

  const onBonusStreak = state.score.streak >= 5;

  return (
    <main
      className="flex min-h-screen flex-col bg-[var(--canvas)] text-[var(--ink)]"
      data-testid="in-game"
    >
      {/* Sticky top bar — status + clock + streak. Always visible regardless
          of scroll so the player never loses sight of the timer / counters. */}
      <div className="sticky top-0 z-10 bg-[var(--canvas)] px-5 pt-4 pb-3 border-b border-[var(--line)]">
        <div className="flex items-center justify-between mb-2 text-[13px] text-[var(--muted)]">
          <span data-testid="question-counter">
            Q{questionNumber} of {totalQuestions}
          </span>
          <span data-testid="correct-counter" className="tabular-nums">
            <span className="text-[var(--success)] font-semibold">{state.score.correctCount}</span>
            <span> ✓</span>
            {state.score.wrongCount > 0 && (
              <>
                <span> · </span>
                <span className="text-[var(--error)] font-semibold">{state.score.wrongCount}</span>
                <span> ✗</span>
              </>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <AudioWaveform active={audioActive} />
            {state.phase === "reading" ? "Reading" : ""}
          </span>
        </div>
        <Clock ms={state.score.clockMs} />
        <div className="flex items-center justify-center gap-3 mt-2 text-[13px] text-[var(--muted)]">
          <span>Streak</span>
          <strong className="text-[var(--ink)] tabular-nums">{state.score.streak}</strong>
          <StreakDots streak={state.score.streak} />
          {onBonusStreak && (
            <span
              className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] font-semibold text-[12px]"
              data-testid="streak-fire"
              aria-label="On a roll: bonus time active"
            >
              <span aria-hidden="true">🔥</span>
              On a roll
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pt-4 pb-6 flex-1">
        {/* Streak announcement (replaces fact) */}
        {state.phase === "reveal" && state.reveal?.streakAnnouncement && (
          <div
            className="text-center my-3"
            data-testid="streak-reveal"
            role="status"
            aria-live="assertive"
          >
            <div className="font-display text-[40px] font-extrabold leading-none tracking-tight">
              {state.reveal.streakAnnouncement === "streak-5" ? "5 in a row" : "10 in a row"}
            </div>
            <div className="text-[var(--muted)] text-[16px] mt-1">Bonus time activated</div>
          </div>
        )}

        {/* Bonus-streak-lost message during reveal */}
        {state.phase === "reveal" && state.reveal?.bonusStreakLost && (
          <div
            className="text-center mb-2 font-semibold text-[14px] text-[var(--accent-strong)]"
            data-testid="bonus-streak-lost"
            role="status"
            aria-live="polite"
          >
            💔 Bonus streak lost
          </div>
        )}

        {/* Question prompt */}
        <div className="font-display font-semibold text-[20px] leading-tight my-3">
          {question.prompt}
        </div>

        {/* Result label on reveal (skipped when a streak announcement is showing) */}
        {state.phase === "reveal" && state.reveal && !state.reveal.streakAnnouncement && (
          <div
            className={`text-center mb-2 font-display font-bold text-[20px] ${
              state.reveal.correct ? "text-[var(--success)]" : "text-[var(--error)]"
            }`}
            data-testid="result-label"
            role="status"
            aria-live="assertive"
          >
            {state.reveal.correct
              ? "Correct"
              : state.reveal.correctIdx >= 0
                ? `Incorrect — the answer was ${question.choices[state.reveal.correctIdx]}`
                : "Out of time"}
          </div>
        )}

        {/* Choices */}
        <div>
          {question.choices.map((label, i) => (
            <ChoiceTile
              key={i}
              label={label}
              state={choiceStateFor(state.phase, state.reveal, i, tappedChoiceIdx)}
              onClick={() => onTapChoice(i)}
              shortcutKey={i + 1}
            />
          ))}
        </div>

        {/* Fact text on reveal (when not a streak announcement) */}
        {state.phase === "reveal" && state.reveal && !state.reveal.streakAnnouncement && state.reveal.fact && (
          <div
            className="mt-3 px-3 py-2 rounded-md bg-[var(--surface)] text-[13px] text-[var(--muted)] leading-relaxed"
            data-testid="fact-text"
            role="status"
            aria-live="polite"
          >
            {state.reveal.fact}
          </div>
        )}
      </div>

      {isRecovering && <PauseOverlay />}
    </main>
  );
};
