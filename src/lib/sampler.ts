/**
 * Question sampling for an attempt.
 *
 * Each attempt draws fresh — no shared seed across players or attempts.
 *
 * Why TOTAL_PER_ATTEMPT is large (100): the game ends when the clock hits 0
 * OR when the question pool is exhausted, whichever comes first. With a 120s
 * base clock + streak bonuses (up to 240s), the upper bound on how many
 * questions a player can plausibly answer is ~30-40. Sampling 100 gives plenty
 * of headroom so the clock is the natural end. If the bank itself has fewer
 * than 100 audited rows, the sampler returns the whole bank and the game can
 * end via "max-questions" (the celebratory "you ran the table" path).
 *
 * Difficulty distribution target:
 *   30% easy   (30 of 100)
 *   50% medium (50 of 100)
 *   20% hard   (20 of 100)
 *
 * DIFFICULTY CURVE (v0.7.0):
 * Within an attempt, questions are ordered easy → medium → hard so the player
 * builds momentum on the early questions and ramps up. Within each difficulty
 * band the order is randomized per attempt (no positional bias). Real-user
 * feedback before this change: "lots of folks come back saying it was very
 * hard" — caused by the prior fully-random shuffle dropping a hard question
 * at Q3 in many attempts. The curve fixes that without changing the totals.
 *
 * EMPTY-BUCKET FALLBACK (eng review critical gap #2):
 * If a difficulty bucket can't supply its target count, the sampler tops up
 * from the remaining bank rather than silently shipping a shorter game. Order
 * of preference for top-up: medium → easy → hard. The total is capped at the
 * bank size.
 */

import type { Question, Difficulty } from "./types";

export const TOTAL_PER_ATTEMPT = 100;
export const TARGET_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 30,
  medium: 50,
  hard: 20,
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

  // Difficulty curve: easy → medium → hard, randomized within each band.
  // Front-loads the early questions with easy ones so players build momentum
  // before hitting the harder ones.
  return orderByDifficultyCurve(picks, rng).map((q) => q.id);
};

/**
 * Order picks easy → medium → hard, with within-band randomization.
 * Pure: does not mutate input.
 */
const orderByDifficultyCurve = (picks: Question[], rng: () => number): Question[] => {
  const byDiff: Record<Difficulty, Question[]> = { easy: [], medium: [], hard: [] };
  for (const q of picks) byDiff[q.difficulty].push(q);
  return [
    ...shuffle(byDiff.easy, rng),
    ...shuffle(byDiff.medium, rng),
    ...shuffle(byDiff.hard, rng),
  ];
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
