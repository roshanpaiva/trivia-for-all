"use client";

/**
 * Post-game screen — two variants:
 *   - Attempts remaining: score + "Play another" + "Practice mode" + "View leaderboard"
 *   - 5/5 used: score + "Resets in Xh" + Notify-me email input + Practice mode CTA
 *
 * The 5/5 upsell is intentionally soft (D9 from /office-hours D11 + /plan-design-review).
 */

import { useState, type FormEvent } from "react";
import { signupForNotify, ApiError } from "@/lib/api";

type Props = {
  score: number;
  wrongCount: number;
  bestToday: number;
  attemptsRemaining: number;
  msUntilReset: number;
  onPlayAgain: () => void;
  onPractice: () => void;
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

const NotifyMeForm = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    setErrorText(null);
    try {
      await signupForNotify(email);
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      const message = err instanceof ApiError && err.code === "invalid_email"
        ? "That doesn't look like a valid email."
        : "Something went wrong — try again.";
      setErrorText(message);
    }
  };

  if (status === "ok") {
    return (
      <div className="rounded-md bg-[var(--accent-soft)] text-[var(--accent-strong)] px-4 py-3 text-[14px] text-center">
        We'll let you know when v2 launches!
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[var(--ink)] rounded-lg p-5 mb-4"
      data-testid="notify-form"
    >
      <div className="text-[12px] uppercase tracking-[0.12em] text-[var(--muted)] mb-1">
        Coming soon
      </div>
      <div className="font-display font-semibold text-[18px] mb-2">
        Unlimited attempts
      </div>
      <p className="text-[14px] text-[var(--muted)] mb-3">
        Play as many times as you want each day. We'll only email you when v2 launches. One-tap unsubscribe.
      </p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        required
        className="w-full min-h-[48px] rounded-md border border-[var(--line)] bg-[var(--canvas)] text-[var(--ink)] px-3 mb-2 focus-visible:ring-2 focus-visible:ring-[var(--ink)] outline-none"
        aria-label="Email address"
      />
      <button
        type="submit"
        disabled={status === "submitting" || !email}
        className="w-full min-h-[56px] rounded-md border border-[var(--ink)] bg-[var(--canvas)] text-[var(--ink)] font-semibold text-[16px] hover:bg-[var(--surface)] disabled:opacity-50"
      >
        {status === "submitting" ? "Sending…" : "Notify me ▸"}
      </button>
      {errorText && (
        <p className="text-[var(--error)] text-[14px] mt-2" role="alert">
          {errorText}
        </p>
      )}
    </form>
  );
};

export const PostGame = ({
  score,
  wrongCount,
  bestToday,
  attemptsRemaining,
  msUntilReset,
  onPlayAgain,
  onPractice,
}: Props) => {
  const isExhausted = attemptsRemaining === 0;
  const isNewBest = score >= bestToday;

  return (
    <main
      className="flex min-h-screen flex-col px-5 py-6 bg-[var(--canvas)] text-[var(--ink)]"
      data-testid="post-game"
    >
      <div className="text-[12px] uppercase tracking-[0.12em] text-[var(--muted)] text-center mt-2">
        {isExhausted ? "attempt 5 of 5 done" : `attempt done — ${attemptsRemaining} left today`}
      </div>

      <div
        className="font-display font-extrabold text-[96px] leading-none tracking-tighter text-center text-[var(--accent)] tabular-nums mt-4"
        data-testid="score-display"
      >
        {score}
      </div>
      <div className="text-[var(--muted)] text-[12px] uppercase tracking-[0.12em] text-center mt-2">
        {isExhausted ? "your best today" : "correct in 90s"}
      </div>

      <div className="flex justify-center gap-2 my-5">
        <span className="px-3 py-1 rounded-full border border-[var(--line)] text-[14px] text-[var(--muted)]">
          Wrong: {wrongCount}
        </span>
      </div>

      {!isExhausted && (
        <div className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-lg p-6 text-center mb-5" data-testid="best-card">
          <div className="text-[14px] text-[var(--muted)] uppercase tracking-[0.12em]">Best today</div>
          <div className="font-display font-extrabold text-[32px] mt-2">
            {bestToday}{" "}
            {isNewBest && (
              <span className="text-[var(--accent)] font-semibold text-[20px]">— new best!</span>
            )}
          </div>
        </div>
      )}

      {isExhausted && (
        <div className="text-center my-5">
          <div className="font-display font-semibold text-[22px]">All 5 attempts used</div>
          <div className="text-[var(--muted)] text-[18px] mt-2">
            Try again in <span className="text-[var(--ink)] font-semibold">{formatCountdown(msUntilReset)}</span>
          </div>
        </div>
      )}

      {isExhausted && <NotifyMeForm />}

      {!isExhausted ? (
        <button
          type="button"
          onClick={onPlayAgain}
          className="w-full min-h-[76px] rounded-lg bg-[var(--ink)] text-[var(--canvas)] font-bold text-[28px] hover:opacity-85 mb-3"
          data-testid="play-again"
        >
          Play another ({attemptsRemaining} left)
        </button>
      ) : null}

      <button
        type="button"
        onClick={onPractice}
        className="w-full min-h-[68px] rounded-lg border border-[var(--line)] bg-[var(--canvas)] text-[var(--ink)] font-semibold text-[22px] hover:border-[var(--ink)]"
        data-testid="practice-cta"
      >
        Practice mode {isExhausted && "(still unlimited)"}
      </button>

      <a
        href="/leaderboard"
        className="block text-center mt-4 text-[14px] underline text-[var(--ink)]"
      >
        View leaderboard
      </a>
    </main>
  );
};
