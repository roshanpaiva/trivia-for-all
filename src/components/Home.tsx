"use client";

/**
 * Home screen. Three variants per /plan-design-review decisions:
 *   - First-time visitor (D5): "Best today" slot replaced with one-line how-to-play
 *   - Returning user with attempts left: standard layout with best score + counter
 *   - Returning user 0/5 used (D8): primary CTA swaps to "Practice mode" + countdown
 */

import { BrandMark } from "./BrandMark";
import { Attribution } from "./Attribution";
import { useState } from "react";
import { MAX_LENGTH as NAME_MAX_LENGTH, sanitize as sanitizeName } from "@/lib/displayName";
import type { AttemptMode, PlayMode } from "@/lib/types";

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
  /** Caller's all-time best score. Persists across daily reset so the pride
   * moment ("I got 26 once") doesn't evaporate at midnight UTC. Null until
   * they've finished a scored attempt. */
  personalBest?: number | null;
  /** v2: when true, render the Solo / Party mode picker. Gated behind the
   * `?party=1` URL flag during soft launch — until set, Home is byte-identical
   * to v1 from the user's perspective. Parent owns the flag. */
  partyEnabled?: boolean;
  /** v2: currently active play mode. Parent owns the state so it can pass it
   * to startAttempt when the user taps Start. */
  playMode?: PlayMode;
  /** v2: notified when the user taps a different mode tab. */
  onPlayModeChange?: (mode: PlayMode) => void;
  /** v2: NEW pill on the Party tab is hidden once the user has interacted with
   * the picker. Parent owns the flag (localStorage) so the pill stays hidden
   * across visits on the same device. */
  partyPickerSeen?: boolean;
  /** v2: notified the first time the user interacts with the picker. */
  onPartyPickerSeen?: () => void;
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
  personalBest = null,
  partyEnabled = false,
  playMode = "solo",
  onPlayModeChange,
  partyPickerSeen = false,
  onPartyPickerSeen,
}: Props) => {
  // A returning player who comes back the next day has bestToday=null +
  // attemptsRemaining=5, but they DO have a personal best — so they shouldn't
  // see the first-time how-to-play copy.
  const isFirstTime =
    bestToday === null && attemptsRemaining === 5 && (personalBest ?? 0) === 0;
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
      className="flex min-h-screen flex-col px-5 py-6 bg-[var(--canvas)] text-[var(--ink)]"
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
            {personalBest !== null && (
              <span data-testid="personal-best">
                {" · "}
                Personal best: <strong className="text-[var(--ink)] font-display tabular-nums">{personalBest}</strong>
              </span>
            )}
          </p>
        )}
      </div>

      {/* Headline — poster-sized, two-line on phone. Per DESIGN.md `--display-l`
          (36px / 800) bumped up a touch for hero treatment. */}
      <div className="mb-7">
        <div className="text-[12px] uppercase tracking-[0.12em] text-[var(--muted)] mb-2">
          {isExhausted ? "Daily refresh" : "Today's daily"}
        </div>
        <h1 className="font-display font-extrabold text-[40px] leading-[1.05] tracking-tight">
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
            {/* Conditional label tracks active mode per design DD7. Same column
                under the hood (eng D1: reuse display_name); only the label and
                placeholder hint change with the mode. When partyEnabled is
                false (v1 path), the original "Name or team name" copy stays
                so existing users see no change. */}
            {!partyEnabled
              ? "Name or team name"
              : playMode === "party"
                ? "Group name"
                : "Your name"}
          </label>
          <input
            id="display-name"
            type="text"
            value={nameInput}
            maxLength={NAME_MAX_LENGTH}
            placeholder={
              !partyEnabled
                ? "e.g. Alex, or The Smiths"
                : playMode === "party"
                  ? "e.g. The Smiths"
                  : "e.g. Alex"
            }
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
        <div className="mb-5 flex items-center gap-2 text-[18px] text-[var(--muted)]" data-testid="display-name-summary">
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
      <div className="mb-5">
        <span
          className={`inline-block px-4 py-1.5 rounded-full text-[15px] font-semibold ${
            isExhausted
              ? "bg-transparent border border-[var(--line)] text-[var(--muted)]"
              : "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          }`}
          data-testid="attempts-pill"
        >
          {isExhausted ? "All attempts used today" : `${attemptsRemaining} of 5 attempts left`}
        </span>
      </div>

      {/* Mode picker (party-mode soft launch). Per design DD1: segmented control
          between attempts-pill and Start CTA — decision-moment placement.
          Only renders when partyEnabled (URL flag during soft launch). */}
      {partyEnabled && (
        <div
          role="tablist"
          aria-label="Play mode"
          className="mb-5 flex p-1 rounded-full bg-[var(--surface)] border border-[var(--line)]"
          data-testid="mode-picker"
        >
          {(["solo", "party"] as PlayMode[]).map((m) => {
            const isActive = playMode === m;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  if (!partyPickerSeen) onPartyPickerSeen?.();
                  if (m !== playMode) onPlayModeChange?.(m);
                }}
                className={`relative flex-1 min-h-[44px] rounded-full text-[15px] font-semibold transition-colors ${
                  isActive
                    ? "bg-[var(--ink)] text-[var(--canvas)]"
                    : "bg-transparent text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
                data-testid={`mode-tab-${m}`}
              >
                {m === "solo" ? "Solo" : "Party"}
                {/* DD9: one-time NEW pill on the Party tab. --accent-soft +
                    --accent-strong matches the existing "On a roll" pattern.
                    Hidden once the user has interacted with either tab. */}
                {m === "party" && !partyPickerSeen && (
                  <span
                    className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] text-[10px] uppercase tracking-[0.12em] font-bold align-middle"
                    aria-label="New: Party mode"
                    data-testid="party-new-pill"
                  >
                    New
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

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
            className="w-full min-h-[76px] rounded-lg bg-[var(--ink)] text-[var(--canvas)] font-bold text-[28px] hover:opacity-85 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
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
          className="w-full min-h-[76px] rounded-lg bg-[var(--ink)] text-[var(--canvas)] font-bold text-[28px] hover:opacity-85 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          data-testid="practice-primary-cta"
        >
          {isStarting ? "Starting…" : "Practice mode (unlimited)"}
        </button>
      )}

      {/* Secondary CTA — when exhausted, this is a leaderboard link, not
          another start-game button. Render as an anchor so middle-click /
          right-click "open in new tab" work too. */}
      {isExhausted ? (
        <a
          href="/leaderboard"
          className="w-full min-h-[68px] rounded-lg border border-[var(--line)] bg-[var(--canvas)] text-[var(--ink)] font-semibold text-[22px] mt-3 hover:border-[var(--ink)] transition-colors flex items-center justify-center"
          data-testid="practice-secondary-cta"
        >
          View leaderboard
        </a>
      ) : (
        <button
          type="button"
          onClick={() => handleStart("practice")}
          className="w-full min-h-[68px] rounded-lg border border-[var(--line)] bg-[var(--canvas)] text-[var(--ink)] font-semibold text-[22px] mt-3 hover:border-[var(--ink)] transition-colors"
          data-testid="practice-secondary-cta"
        >
          Practice mode (unlimited)
        </button>
      )}

      {/* Footer */}
      <div className="mt-auto pt-6 border-t border-dashed border-[var(--line)]">
        <div className="flex items-center justify-between text-[14px] text-[var(--muted)] mb-2">
          <span>Resets at midnight UTC</span>
          <a href="/leaderboard" className="text-[var(--ink)] underline">
            Leaderboard
          </a>
        </div>
        <Attribution />
      </div>
    </main>
  );
};
