"use client";

/**
 * In-game screen — renders the current phase from useGame().
 * Phase rendering logic per D7 from /plan-design-review.
 */

import { useEffect, useRef } from "react";
import type { ClientQuestion } from "@/lib/types";
import { Clock } from "./Clock";
import { ChoiceTile, type ChoiceState } from "./ChoiceTile";
import { StreakDots } from "./StreakDots";
import { AudioWaveform, type WaveformState } from "./AudioWaveform";
import { PauseOverlay } from "./PauseOverlay";
import type { GameState } from "@/lib/timer";
import { useStt } from "@/hooks/useStt";
import { matchAnswer } from "@/lib/match";

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
  /** v2 D2: when true, AudioWaveform shows mic states during the answering
   * phase and useStt listens for spoken answers. Caller (page.tsx) gates this
   * on partyEnabled + playMode==='party' + micPermission==='granted' + !sttDisabled. */
  voiceEnabled?: boolean;
  /** v2 telemetry: notified when the useStt watchdog escalates to "degraded".
   * Parent fires `reportSttDegrade(attemptId)` so we can answer "what % of
   * party attempts had to degrade to tap-only" from the data alone. */
  onSttDegrade?: () => void;
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
  voiceEnabled = false,
  onSttDegrade,
}: Props) => {
  // Tapped choice is tracked in GameState (set on tap-answer, cleared on
  // reveal-complete). Drives validating-this + reveal-wrong styling.
  const tappedChoiceIdx = state.tappedChoiceIdx;

  // Latest tap callback in a ref so the STT result handler doesn't restart
  // the recognition every time the parent re-binds it.
  const onTapChoiceRef = useRef(onTapChoice);
  useEffect(() => { onTapChoiceRef.current = onTapChoice; }, [onTapChoice]);

  // Hold onSttDegrade in a ref so the useStt subscription doesn't churn when
  // the parent re-binds the callback every render.
  const onSttDegradeRef = useRef(onSttDegrade);
  useEffect(() => { onSttDegradeRef.current = onSttDegrade; }, [onSttDegrade]);

  // STT (party mode only). Match against the current question's choices with
  // strictness=1 (party — strict; eng D7 + DD7).
  const stt = useStt({
    enabled: voiceEnabled,
    onResult: (transcript) => {
      const idx = matchAnswer(transcript, question.choices, 1);
      if (idx !== null) onTapChoiceRef.current(idx);
      // No-match: leave the listen cycle alone; the watchdog will restart on
      // the natural onend or the user can tap to answer.
    },
    onDegrade: () => onSttDegradeRef.current?.(),
  });

  // Drive STT lifecycle from the game phase. Listen ONLY during answering;
  // stop the moment the phase exits answering (validating, reveal, reading).
  // The watchdog inside useStt handles silent-drop restarts within that window.
  useEffect(() => {
    if (!voiceEnabled) return;
    if (state.phase === "answering") {
      stt.start();
    } else {
      stt.stop();
    }
    // Reset watchdog state between questions so a degraded session can recover
    // when a fresh question starts (only meaningful if voiceEnabled flips back
    // to true after a permission re-grant; harmless otherwise).
    if (state.phase === "reading") stt.reset();
  }, [state.phase, voiceEnabled, stt]);

  // Audio surface state — single component, multiple modes (DD2 + DD4). TTS
  // wins over STT visually when both could apply (TTS only fires during reading,
  // STT only during answering, so they never actually overlap).
  const waveformState: WaveformState = audioActive
    ? "tts-reading"
    : voiceEnabled && state.phase === "answering"
      ? stt.phase === "still-listening"
        ? "mic-still-listening"
        : stt.phase === "degraded"
          ? "mic-degraded"
          : stt.phase === "listening"
            ? "mic-listening"
            : "off"
      : "off";

  const statusLabel =
    state.phase === "reading"
      ? "Reading"
      : voiceEnabled && state.phase === "answering"
        ? stt.phase === "degraded"
          ? "Voice off"
          : stt.phase === "still-listening"
            ? "Still listening…"
            : stt.phase === "listening"
              ? "Listening"
              : ""
        : "";

  // Timeout hint: when STT has been still-listening for the configured period,
  // surface "Didn't catch that — tap an answer" in the existing result-label
  // slot (DD5). The hint piggybacks off the still-listening state — no
  // separate timer needed.
  const showTimeoutHint =
    voiceEnabled &&
    state.phase === "answering" &&
    (stt.phase === "still-listening" || stt.phase === "degraded");

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
          <span className="flex items-center gap-1.5" data-testid="audio-status">
            <AudioWaveform state={waveformState} />
            {/* aria-live for screen readers (DD12). Empty span when status is
                blank avoids a11y noise on every render. */}
            <span aria-live="polite" aria-atomic="true">{statusLabel}</span>
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

        {/* Timeout hint banner (DD5). Surfaces when STT has been silent past
            the still-listening threshold. Lives in the existing result-label
            slot; only shown during the answering phase, so it never collides
            with the actual reveal label below. */}
        {showTimeoutHint && (
          <div
            className="text-center mb-2 font-display text-[16px] text-[var(--muted)]"
            data-testid="timeout-hint"
            role="status"
            aria-live="polite"
          >
            Didn&rsquo;t catch that &mdash; tap an answer.
          </div>
        )}

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
