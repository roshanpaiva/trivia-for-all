"use client";

/**
 * Home screen. Three variants per /plan-design-review decisions:
 *   - First-time visitor (D5): "Best today" slot replaced with one-line how-to-play
 *   - Returning user with attempts left: standard layout with best score + counter
 *   - Returning user 0/5 used (D8): primary CTA swaps to "Practice mode" + countdown
 */

import { BrandMark } from "./BrandMark";
import { useState } from "react";
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
};

const formatCountdown = (ms: number): string => {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
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
}: Props) => {
  const isFirstTime = bestToday === null && attemptsRemaining === 5;
  const isExhausted = attemptsRemaining === 0;
  const [audioActive] = useState(false); // future: animate when TTS plays a sample

  return (
    <main
      className="flex min-h-screen flex-col mx-auto max-w-[420px] px-5 py-6 bg-[var(--canvas)] text-[var(--ink)]"
      data-testid="home"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-dashed border-[var(--line)]">
        <BrandMark audioActive={audioActive} />
        {isFirstTime ? (
          <span className="text-[14px] text-[var(--muted)]" data-testid="how-to-play">
            90s. Tap fast. Streaks add bonus time.
          </span>
        ) : (
          <span className="text-[14px] text-[var(--muted)]">
            Best today: <strong className="text-[var(--ink)] font-display tabular-nums">{bestToday ?? "—"}</strong>
          </span>
        )}
      </div>

      {/* Headline */}
      <div className="mb-6">
        <div className="text-[12px] uppercase tracking-[0.12em] text-[var(--muted)] mb-1">
          {isExhausted ? "All done today" : "Today's daily"}
        </div>
        <h1 className="font-display font-bold text-[28px] leading-tight tracking-tight">
          {isExhausted ? (
            <>Resets in <span className="text-[var(--accent)]">{msUntilReset !== undefined ? formatCountdown(msUntilReset) : "—"}</span></>
          ) : (
            <>90 seconds. <span className="text-[var(--accent)]">As many as you can get.</span></>
          )}
        </h1>
      </div>

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
        <button
          type="button"
          onClick={() => onStart("scored")}
          disabled={isStarting}
          className="w-full min-h-[64px] rounded-lg bg-[var(--ink)] text-[var(--canvas)] font-bold text-[22px] hover:opacity-85 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          data-testid="start-button"
        >
          {isStarting ? "Starting…" : hasResumableAttempt ? "Resume ▸" : "Start ▸"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onStart("practice")}
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
        onClick={() => onStart("practice")}
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
