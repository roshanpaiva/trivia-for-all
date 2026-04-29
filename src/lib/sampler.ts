/**
 * Question sampling for an attempt.
 *
 * Per design doc → "Question Sampling Algorithm". Random per-attempt — no shared
 * seed across players or attempts. Each scored or practice attempt gets a fresh
 * 20-question draw.
 *
 * Difficulty distribution target (from the design doc):
 *   30% easy   (6 of 20)
 *   50% medium (10 of 20)
 *   20% hard   (4 of 20)
 *
 * EMPTY-BUCKET FALLBACK (eng review critical gap #2):
 * If a difficulty bucket can't supply its target count (early-bank state, e.g.
 * zero hard questions), the sampler tops up from the remaining bank rather than
 * silently shipping a shorter game. Order of preference for top-up: medium →
 * easy → hard. The total is capped at the bank size; if the bank is smaller
 * than TOTAL_PER_ATTEMPT, the sampler returns the whole bank shuffled.
 */

import type { Question, Difficulty } from "./types";

export const TOTAL_PER_ATTEMPT = 20;
export const TARGET_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 6,
  medium: 10,
  hard: 4,
};

/** Top-up preference when a bucket is short. Earlier = preferred. */
const TOP_UP_ORDER: Difficulty[] = ["medium", "easy", "hard"];

export type SamplerOptions = {
  /** Inject a deterministic RNG for tests. Defaults to Math.random. */
  rng?: () => number;
};

/**
 * Sample question IDs for one attempt. Returns up to TOTAL_PER_ATTEMPT IDs in
 * random order, drawn from the bank with the difficulty distribution above.
 *
 * The returned IDs are sufficient to fetch full Question records server-side;
 * the IDs themselves are safe to send to the client (correctIdx never travels).
 */
export const sampleAttemptQuestions = (
  bank: Question[],
  options: SamplerOptions = {},
): string[] => {
  const rng = options.rng ?? Math.random;

  if (bank.length === 0) return [];

  const byDifficulty: Record<Difficulty, Question[]> = {
    easy: [],
    medium: [],
    hard: [],
  };
  for (const q of bank) byDifficulty[q.difficulty].push(q);

  const picks: Question[] = [];
  const pickedIds = new Set<string>();

  // First pass: take from each difficulty bucket up to its target
  for (const diff of ["easy", "medium", "hard"] as const) {
    const target = TARGET_BY_DIFFICULTY[diff];
    const sampled = sampleWithoutReplacement(byDifficulty[diff], target, rng);
    for (const q of sampled) {
      picks.push(q);
      pickedIds.add(q.id);
    }
  }

  // Second pass: top up from remaining questions if we fell short
  // (the empty-bucket fallback). Prefer medium, then easy, then hard.
  let needed = Math.min(TOTAL_PER_ATTEMPT, bank.length) - picks.length;
  if (needed > 0) {
    for (const diff of TOP_UP_ORDER) {
      if (needed <= 0) break;
      const remaining = byDifficulty[diff].filter((q) => !pickedIds.has(q.id));
      const sampled = sampleWithoutReplacement(remaining, needed, rng);
      for (const q of sampled) {
        picks.push(q);
        pickedIds.add(q.id);
      }
      needed = Math.min(TOTAL_PER_ATTEMPT, bank.length) - picks.length;
    }
  }

  // Final shuffle: order is randomized per attempt (no positional bias)
  return shuffle(picks, rng).map((q) => q.id);
};

/**
 * Fisher-Yates partial shuffle. Returns `count` items from `arr` without
 * replacement, in pick order. Pure: does not mutate `arr`.
 */
const sampleWithoutReplacement = <T>(arr: T[], count: number, rng: () => number): T[] => {
  if (count <= 0 || arr.length === 0) return [];
  if (count >= arr.length) return shuffle(arr, rng);

  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const j = Math.floor(rng() * pool.length);
    out.push(pool[j]);
    pool.splice(j, 1);
  }
  return out;
};

/** Fisher-Yates shuffle. Pure: does not mutate input. */
const shuffle = <T>(arr: T[], rng: () => number): T[] => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * Seeded RNG — mulberry32. Useful for tests that need deterministic shuffles.
 * Not for production: real per-attempt sampling uses Math.random.
 */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
