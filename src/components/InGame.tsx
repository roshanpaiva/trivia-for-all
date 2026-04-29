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
  // Track which choice the player tapped (for validating-this + reveal-wrong styling)
  const tappedChoiceIdx =
    state.phase === "validating" || state.phase === "reveal"
      ? // We don't have direct access to the tapped index in GameState, so derive
        // from reveal.correct: if revealing wrong, it was the tapped choice that
        // was wrong; if revealing correct, the tapped was the correct choice.
        state.reveal?.correct
          ? state.reveal.correctIdx
          : null  // will need explicit tapped tracking — see Note below
      : null;

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

  // Auto-advance reveal: after the fact audio's expected duration, finish reveal.
  // 3500ms covers: 2-3s fact + a beat. Streak announcements get the same window.
  useEffect(() => {
    if (state.phase !== "reveal") return;
    const id = window.setTimeout(onFinishReveal, 3500);
    return () => window.clearTimeout(id);
  }, [state.phase, onFinishReveal]);

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

  return (
    <main
      className="flex min-h-screen flex-col mx-auto max-w-[420px] px-5 py-6 bg-[var(--canvas)] text-[var(--ink)]"
      data-testid="in-game"
    >
      {/* Top status row */}
      <div className="flex items-center justify-between mb-4 text-[14px] text-[var(--muted)]">
        <span data-testid="question-counter">
          Q{questionNumber} of {totalQuestions}
        </span>
        <span className="flex items-center gap-2">
          <AudioWaveform active={audioActive} />
          {state.phase === "reading" ? "Reading" : ""}
        </span>
      </div>

      {/* Clock — always visible, dominant element */}
      <Clock ms={state.score.clockMs} />

      {/* Streak row */}
      <div className="flex items-center justify-center gap-3 my-4 text-[14px] text-[var(--muted)]">
        <span>Streak</span>
        <strong className="text-[var(--ink)] tabular-nums">{state.score.streak}</strong>
        <StreakDots streak={state.score.streak} />
      </div>

      {/* Streak announcement (replaces fact) */}
      {state.phase === "reveal" && state.reveal?.streakAnnouncement && (
        <div
          className="text-center my-6"
          data-testid="streak-reveal"
          role="status"
          aria-live="assertive"
        >
          <div className="font-display text-[48px] font-extrabold leading-none tracking-tight">
            {state.reveal.streakAnnouncement === "streak-5" ? "5 in a row" : "10 in a row"}
          </div>
          <div className="text-[var(--muted)] text-[18px] mt-2">Bonus time activated</div>
        </div>
      )}

      {/* Question prompt */}
      <div className="font-display font-semibold text-[22px] leading-tight my-6">
        {question.prompt}
      </div>

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
          className="mt-4 px-4 py-3 rounded-md bg-[var(--surface)] text-[14px] text-[var(--muted)] leading-relaxed"
          data-testid="fact-text"
          role="status"
          aria-live="polite"
        >
          {state.reveal.fact}
        </div>
      )}

      {isRecovering && <PauseOverlay />}
    </main>
  );
};
