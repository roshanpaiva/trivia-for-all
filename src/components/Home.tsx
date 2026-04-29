"use client";

/**
 * Home screen. Three variants per /plan-design-review decisions:
 *   - First-time visitor (D5): "Best today" slot replaced with one-line how-to-play
 *   - Returning user with attempts left: standard layout with best score + counter
 *   - Returning user 0/5 used (D8): primary CTA swaps to "Practice mode" + countdown
 */

import { BrandMark } from "./BrandMark";
import { useState } from "react";
import { MAX_LENGTH as NAME_MAX_LENGTH, sanitize as sanitizeName } from "@/lib/displayName";
import type { AttemptMode } from "@/lib/types";

type Props = {
  bestToday: number | null;
  attemptsRemaining: number;
  onStart: (mode: AttemptMode) => void;
  /** Set when there's an in-progress attempt to resume. */
  hasResumableAttempt?: boolean;
  /** Set on the 0/5-used variant. ms until midnight UTC. */
  msUntilReset?: number;
  /** Surfaces a failure from the start path so users aren't left guessing. */
  errorMessage?: string | null;
  /** True while the start request is in flight; disables the button + shows label. */
  isStarting?: boolean;
  /** Player-supplied display name; null until the player sets one. */
  displayName?: string | null;
  /** Persist a new name (parent owns localStorage). Pass null to clear. */
  onNameChange?: (name: string | null) => void;
};

const formatCountdown = (ms: number): string => {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  if (totalMin < 1) return "less than a minute";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

export const Home = ({
  bestToday,
  attemptsRemaining,
  onStart,
  hasResumableAttempt = false,
  msUntilReset,
  errorMessage = null,
  isStarting = false,
  displayName = null,
  onNameChange,
}: Props) => {
  const isFirstTime = bestToday === null && attemptsRemaining === 5;
  const isExhausted = attemptsRemaining === 0;
  const [audioActive] = useState(false); // future: animate when TTS plays a sample
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName ?? "");

  const showNameInput = !displayName || isEditingName;
  // Resolved name considering an in-flight typing buffer too.
  const effectiveName = sanitizeName(displayName) ?? sanitizeName(nameInput);
  // Scored mode requires a name (so leaderboard rows are meaningful). Practice
  // stays anonymous-allowed — it never lands on the leaderboard anyway.
  const needsNameForScored = !effectiveName;

  const commitName = () => {
    const cleaned = sanitizeName(nameInput);
    onNameChange?.(cleaned);
    setIsEditingName(false);
  };

  const handleStart = (mode: AttemptMode) => {
    // If the player typed a name but never confirmed (no blur, no Enter), save
    // it on Start so the score lands on the leaderboard with their name.
    if (showNameInput && nameInput.trim().length > 0) {
      const cleaned = sanitizeName(nameInput);
      if (cleaned !== displayName) onNameChange?.(cleaned);
    }
    onStart(mode);
  };

  return (
    <main
      className="flex min-h-screen flex-col mx-auto max-w-[420px] px-5 py-6 bg-[var(--canvas)] text-[var(--ink)]"
      data-testid="home"
    >
      {/* Header — brand on top, status text below. Stacked so the bigger
          BrandMark (28px) gets room without squeezing the status copy. */}
      <div className="mb-6 pb-4 border-b border-dashed border-[var(--line)]">
        <BrandMark audioActive={audioActive} />
        {isFirstTime ? (
          <p className="text-[14px] text-[var(--muted)] mt-2" data-testid="how-to-play">
            120s. Tap fast. Streaks add bonus time.
          </p>
        ) : (
          <p className="text-[14px] text-[var(--muted)] mt-2">
            Best today: <strong className="text-[var(--ink)] font-display tabular-nums">{bestToday ?? "—"}</strong>
          </p>
        )}
      </div>

      {/* Headline */}
      <div className="mb-6">
        <div className="text-[12px] uppercase tracking-[0.12em] text-[var(--muted)] mb-1">
          {isExhausted ? "Daily refresh" : "Today's daily"}
        </div>
        <h1 className="font-display font-bold text-[28px] leading-tight tracking-tight">
          {isExhausted ? (
            <>Try again in <span className="text-[var(--accent)]">{msUntilReset !== undefined ? formatCountdown(msUntilReset) : "—"}</span></>
          ) : (
            <>120 seconds. <span className="text-[var(--accent)]">As many as you can get.</span></>
          )}
        </h1>
      </div>

      {/* Name field — first-time + edit mode show the input; otherwise show
          "Playing as <name> · Edit". */}
      {showNameInput ? (
        <div className="mb-4">
          <label htmlFor="display-name" className="block text-[12px] uppercase tracking-[0.12em] text-[var(--muted)] mb-1">
            Name or team name
          </label>
          <input
            id="display-name"
            type="text"
            value={nameInput}
            maxLength={NAME_MAX_LENGTH}
            placeholder="e.g. Alex, or The Smiths"
            autoComplete="nickname"
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitName();
              }
            }}
            className="w-full min-h-[48px] px-3 rounded-md border border-[var(--line)] bg-[var(--canvas)] text-[var(--ink)] text-[18px] focus:border-[var(--accent)] focus:outline-none"
            data-testid="display-name-input"
          />
          <p className="text-[12px] text-[var(--muted)] mt-1">
            Shown on the leaderboard. You can change it anytime.
          </p>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 text-[14px] text-[var(--muted)]" data-testid="display-name-summary">
          <span>Playing as</span>
          <strong className="text-[var(--ink)]">{displayName}</strong>
          <span>·</span>
          <button
            type="button"
            onClick={() => {
              setNameInput(displayName ?? "");
              setIsEditingName(true);
            }}
            className="text-[var(--ink)] underline"
            data-testid="edit-name-button"
          >
            Edit
          </button>
        </div>
      )}

      {/* Status pill */}
      <div className="mb-4">
        <span
          className={`inline-block px-3 py-1 rounded-full text-[14px] font-semibold ${
            isExhausted
              ? "bg-transparent border border-[var(--line)] text-[var(--muted)]"
              : "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          }`}
          data-testid="attempts-pill"
        >
          {isExhausted ? "All attempts used today" : `${attemptsRemaining} of 5 attempts left`}
        </span>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div
          className="mb-3 px-3 py-2 rounded-md border border-[var(--error)] bg-[rgba(163,59,42,0.08)] text-[14px] text-[var(--error)]"
          role="alert"
          data-testid="start-error"
        >
          Couldn&apos;t start the game: {errorMessage}
        </div>
      )}

      {/* Primary CTA */}
      {!isExhausted ? (
        <>
          <button
            type="button"
            onClick={() => handleStart("scored")}
            disabled={isStarting || needsNameForScored}
            className="w-full min-h-[64px] rounded-lg bg-[var(--ink)] text-[var(--canvas)] font-bold text-[22px] hover:opacity-85 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            data-testid="start-button"
          >
            {isStarting ? "Starting…" : hasResumableAttempt ? "Resume ▸" : "Start ▸"}
          </button>
          {needsNameForScored && (
            <p className="mt-2 text-[12px] text-[var(--muted)] text-center" data-testid="name-required-hint">
              Add your name above to play scored. Practice mode below works without one.
            </p>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => handleStart("practice")}
          disabled={isStarting}
          className="w-full min-h-[64px] rounded-lg bg-[var(--ink)] text-[var(--canvas)] font-bold text-[22px] hover:opacity-85 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          data-testid="practice-primary-cta"
        >
          {isStarting ? "Starting…" : "Practice mode (unlimited)"}
        </button>
      )}

      {/* Secondary CTA */}
      <button
        type="button"
        onClick={() => handleStart("practice")}
        className="w-full min-h-[56px] rounded-lg border border-[var(--line)] bg-[var(--canvas)] text-[var(--ink)] font-semibold text-[18px] mt-3 hover:border-[var(--ink)] transition-colors"
        data-testid="practice-secondary-cta"
      >
        {isExhausted ? "View leaderboard" : "Practice mode (unlimited)"}
      </button>

      {/* Footer */}
      <div className="mt-auto pt-6 border-t border-dashed border-[var(--line)] flex items-center justify-between text-[14px] text-[var(--muted)]">
        <span>Resets at midnight UTC</span>
        <a href="/leaderboard" className="text-[var(--ink)] underline">
          Leaderboard
        </a>
      </div>
    </main>
  );
};
