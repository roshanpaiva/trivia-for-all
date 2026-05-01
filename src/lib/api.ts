/**
 * Typed fetch client for our backend routes.
 *
 * Mirrors the route shapes from src/app/api/*. Centralizes error handling so
 * components don't repeat status-code switches. Each function throws an `ApiError`
 * with a normalized `code` so the UI can branch on it.
 *
 * Tests mock `fetch` via vi.spyOn(globalThis, 'fetch') — see tests/lib/api.test.ts.
 */

import type { AttemptMode, ClientQuestion, PlayMode } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(`API error ${status}: ${code}`);
    this.name = "ApiError";
  }
}

const json = async <T>(res: Response): Promise<T> => {
  if (res.ok) return (await res.json()) as T;
  // Try to parse the structured error payload; fall back to status-only.
  let body: { error?: string; [k: string]: unknown } | null = null;
  try {
    body = (await res.json()) as { error?: string };
  } catch {
    // ignore
  }
  throw new ApiError(body?.error ?? "unknown_error", res.status, body ?? undefined);
};

export type StartAttemptResponse = {
  attemptId: string;
  /** Legacy field — same value as attemptMode. Kept for backward compat
   * with mid-game tabs running pre-Lane-C JS. */
  mode: AttemptMode;
  attemptMode: AttemptMode;
  playMode: PlayMode;
  questionIds: string[];
  questions: ClientQuestion[];
  dateUtc: string;
  attemptsRemaining: number;
};

export type CurrentAttemptResponse =
  | { status: "none" }
  | {
      status: "in_progress";
      attemptId: string;
      mode: AttemptMode;
      questionIds: string[];
      questions: ClientQuestion[];
      answeredCount: number;
      currentStreak: number;
      correctCount: number;
      wrongCount: number;
    };

export type AnswerResponse = {
  correct: boolean;
  correctIdx: number;
  fact: string;
  isDuplicate: boolean;
};

export type FinalizeResponse = {
  score: number;
  wrongCount: number;
  attemptsRemaining: number;
  mode: AttemptMode;
};

type LeaderboardRow = {
  rank: number;
  handle: string;
  isYou: boolean;
  bestScore: number;
  bestWrong: number;
};

export type LeaderboardResponse = {
  /** Top-level fields are SOLO mode only (post-Lane-C semantic narrowing).
   * Pre-Lane-D party play, every score is solo, so behavior is unchanged
   * for current users. */
  top: LeaderboardRow[];
  yourRank: number | null;
  yourBestToday: number | null;
  /** Caller's all-time personal best in SOLO mode. Persists across the daily
   * reset. Lane D may add a cross-mode aggregate; for now this is the field
   * Home renders. */
  yourPersonalBest: number | null;
  /** Scored attempts remaining today (5 max). Cap is shared across solo + party
   * per DD14, so this number is mode-agnostic. */
  yourAttemptsRemaining: number;
  totalPlayers: number;
  dateUtc: string;
  /** All-time SOLO top 10 + caller's all-time SOLO rank. */
  allTime: {
    top: LeaderboardRow[];
    yourRank: number | null;
  };
  /** PARTY-mode mirror of the above. Empty arrays until first party game lands.
   * Lane D wires this into a separate Leaderboard section per design DD3. */
  party: {
    today: {
      top: LeaderboardRow[];
      yourRank: number | null;
      yourBestToday: number | null;
      totalPlayers: number;
    };
    allTime: {
      top: LeaderboardRow[];
      yourRank: number | null;
      yourPersonalBest: number | null;
    };
  };
};

export const startAttempt = async (
  attemptMode: AttemptMode,
  playMode: PlayMode = "solo",
): Promise<StartAttemptResponse> => {
  const res = await fetch("/api/attempt/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Send the new field names. Server still accepts legacy `mode` if any
    // call site is still passing it, but the canonical client posts the new
    // shape from this point forward.
    body: JSON.stringify({ attemptMode, playMode }),
    credentials: "same-origin",
  });
  return json<StartAttemptResponse>(res);
};

export const getCurrentAttempt = async (): Promise<CurrentAttemptResponse> => {
  const res = await fetch("/api/attempt/current", { credentials: "same-origin" });
  return json<CurrentAttemptResponse>(res);
};

export const submitAnswer = async (params: {
  attemptId: string;
  questionId: string;
  choiceIdx: number;
  clientElapsedMs?: number;
}): Promise<AnswerResponse> => {
  const res = await fetch("/api/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    credentials: "same-origin",
  });
  return json<AnswerResponse>(res);
};

export const finalizeAttempt = async (
  attemptId: string,
  displayName?: string | null,
): Promise<FinalizeResponse> => {
  const res = await fetch("/api/attempt/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attemptId, displayName: displayName ?? null }),
    credentials: "same-origin",
  });
  return json<FinalizeResponse>(res);
};

export const getLeaderboard = async (): Promise<LeaderboardResponse> => {
  const res = await fetch("/api/leaderboard", { credentials: "same-origin" });
  return json<LeaderboardResponse>(res);
};

export const signupForNotify = async (email: string, locale?: string): Promise<{ ok: true; isDuplicate: boolean }> => {
  const res = await fetch("/api/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, locale }),
    credentials: "same-origin",
  });
  return json(res);
};

/**
 * Submit an answer with auto-retry on transient network failure.
 * Per design doc D6 → 10 retry cap with 3s backoff. After cap → throws so
 * the caller can show the "we can't reach the server" overlay.
 */
export const submitAnswerWithRetry = async (params: {
  attemptId: string;
  questionId: string;
  choiceIdx: number;
  clientElapsedMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  onRetry?: (attempt: number) => void;
}): Promise<AnswerResponse> => {
  const maxRetries = params.maxRetries ?? 10;
  const delay = params.retryDelayMs ?? 3000;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await submitAnswer(params);
    } catch (e) {
      lastError = e;
      // Only retry on network failures (no Response) or 5xx server errors.
      // 4xx errors are user-fault and re-trying won't help.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) throw e;
      if (attempt === maxRetries) break;
      params.onRetry?.(attempt + 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError ?? new ApiError("network_failure", 0);
};
