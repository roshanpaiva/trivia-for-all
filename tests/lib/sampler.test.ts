import { describe, it, expect } from "vitest";
import {
  sampleAttemptQuestions,
  mulberry32,
  TOTAL_PER_ATTEMPT,
  TARGET_BY_DIFFICULTY,
} from "@/lib/sampler";
import type { Question, Difficulty } from "@/lib/types";

/** Build a synthetic bank of questions for sampler tests. */
const makeBank = (counts: { easy: number; medium: number; hard: number }): Question[] => {
  const out: Question[] = [];
  let n = 0;
  const push = (difficulty: Difficulty, count: number) => {
    for (let i = 0; i < count; i++) {
      n++;
      out.push({
        id: `${difficulty}-${n}`,
        category: "general",
        difficulty,
        prompt: `Q${n}`,
        choices: ["A", "B", "C", "D"],
        correctIdx: 0,
        fact: `Fact ${n}`,
      });
    }
  };
  push("easy", counts.easy);
  push("medium", counts.medium);
  push("hard", counts.hard);
  return out;
};

describe("sampleAttemptQuestions — full bank (target distribution)", () => {
  it("returns exactly TOTAL_PER_ATTEMPT IDs from a healthy bank", () => {
    const bank = makeBank({ easy: 50, medium: 50, hard: 50 });
    const ids = sampleAttemptQuestions(bank, { rng: mulberry32(42) });
    expect(ids).toHaveLength(TOTAL_PER_ATTEMPT);
  });

  it("respects the 30/50/20 difficulty distribution when bank is large", () => {
    const bank = makeBank({ easy: 50, medium: 50, hard: 50 });
    const ids = sampleAttemptQuestions(bank, { rng: mulberry32(42) });
    const lookup = new Map(bank.map((q) => [q.id, q]));
    const picks = ids.map((id) => lookup.get(id)!);

    const counts = picks.reduce(
      (acc, q) => {
        acc[q.difficulty]++;
        return acc;
      },
      { easy: 0, medium: 0, hard: 0 },
    );
    expect(counts.easy).toBe(TARGET_BY_DIFFICULTY.easy);
    expect(counts.medium).toBe(TARGET_BY_DIFFICULTY.medium);
    expect(counts.hard).toBe(TARGET_BY_DIFFICULTY.hard);
  });

  it("returns IDs in randomized order (final shuffle pass)", () => {
    const bank = makeBank({ easy: 50, medium: 50, hard: 50 });
    const idsA = sampleAttemptQuestions(bank, { rng: mulberry32(1) });
    const idsB = sampleAttemptQuestions(bank, { rng: mulberry32(2) });
    expect(idsA).not.toEqual(idsB);
  });

  it("never returns duplicates", () => {
    const bank = makeBank({ easy: 50, medium: 50, hard: 50 });
    const ids = sampleAttemptQuestions(bank, { rng: mulberry32(42) });
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("sampleAttemptQuestions — edge cases", () => {
  it("empty bank returns empty array (no crash)", () => {
    expect(sampleAttemptQuestions([])).toEqual([]);
  });

  it("bank smaller than TOTAL_PER_ATTEMPT returns the whole bank shuffled", () => {
    const bank = makeBank({ easy: 3, medium: 2, hard: 0 });
    const ids = sampleAttemptQuestions(bank, { rng: mulberry32(7) });
    expect(ids).toHaveLength(5);
    expect(new Set(ids)).toEqual(new Set(bank.map((q) => q.id)));
  });

  it("bank with only one difficulty is fully usable (top-up fallback)", () => {
    const bank = makeBank({ easy: 200, medium: 0, hard: 0 });
    const ids = sampleAttemptQuestions(bank, { rng: mulberry32(7) });
    expect(ids).toHaveLength(TOTAL_PER_ATTEMPT);
    // Every pick should be from easy (only bucket available)
    const lookup = new Map(bank.map((q) => [q.id, q]));
    for (const id of ids) {
      expect(lookup.get(id)!.difficulty).toBe("easy");
    }
  });
});

describe("sampleAttemptQuestions — empty bucket fallback (eng review critical gap #2)", () => {
  it("when hard bucket is empty, tops up from medium → still 20 questions", () => {
    const bank = makeBank({ easy: 50, medium: 50, hard: 0 });
    const ids = sampleAttemptQuestions(bank, { rng: mulberry32(7) });
    expect(ids).toHaveLength(TOTAL_PER_ATTEMPT);

    const lookup = new Map(bank.map((q) => [q.id, q]));
    const counts = ids.reduce(
      (acc, id) => {
        acc[lookup.get(id)!.difficulty]++;
        return acc;
      },
      { easy: 0, medium: 0, hard: 0 },
    );
    expect(counts.hard).toBe(0); // bucket is empty
    expect(counts.easy + counts.medium).toBe(TOTAL_PER_ATTEMPT);
    // Most of the deficit should land in medium (preferred top-up)
    expect(counts.medium).toBeGreaterThanOrEqual(TARGET_BY_DIFFICULTY.medium);
  });

  it("when medium bucket is empty, tops up from easy → still 20 questions (no silent shortfall)", () => {
    const bank = makeBank({ easy: 50, medium: 0, hard: 50 });
    const ids = sampleAttemptQuestions(bank, { rng: mulberry32(7) });
    expect(ids).toHaveLength(TOTAL_PER_ATTEMPT);

    const lookup = new Map(bank.map((q) => [q.id, q]));
    const counts = ids.reduce(
      (acc, id) => {
        acc[lookup.get(id)!.difficulty]++;
        return acc;
      },
      { easy: 0, medium: 0, hard: 0 },
    );
    expect(counts.medium).toBe(0); // empty bucket
    expect(counts.easy + counts.hard).toBe(TOTAL_PER_ATTEMPT);
  });

  it("when only hard has questions, returns all hard up to TOTAL_PER_ATTEMPT", () => {
    const bank = makeBank({ easy: 0, medium: 0, hard: 200 });
    const ids = sampleAttemptQuestions(bank, { rng: mulberry32(7) });
    expect(ids).toHaveLength(TOTAL_PER_ATTEMPT);

    const lookup = new Map(bank.map((q) => [q.id, q]));
    for (const id of ids) {
      expect(lookup.get(id)!.difficulty).toBe("hard");
    }
  });

  it("doesn't silently ship a shorter game when a bucket is short", () => {
    // The eng review critical gap: empty hard bucket + small bank used to mean
    // the user got fewer questions than expected silently. Now we top up.
    const bank = makeBank({ easy: 50, medium: 60, hard: 0 });
    const ids = sampleAttemptQuestions(bank, { rng: mulberry32(7) });
    expect(ids).toHaveLength(TOTAL_PER_ATTEMPT); // 100 (50 easy + 50 medium top-up), not 80
  });
});

describe("sampleAttemptQuestions — determinism with seeded RNG", () => {
  it("same seed produces same picks (test reproducibility)", () => {
    const bank = makeBank({ easy: 50, medium: 50, hard: 50 });
    const a = sampleAttemptQuestions(bank, { rng: mulberry32(42) });
    const b = sampleAttemptQuestions(bank, { rng: mulberry32(42) });
    expect(a).toEqual(b);
  });

  it("different seeds produce different picks", () => {
    const bank = makeBank({ easy: 50, medium: 50, hard: 50 });
    const a = sampleAttemptQuestions(bank, { rng: mulberry32(42) });
    const b = sampleAttemptQuestions(bank, { rng: mulberry32(43) });
    expect(a).not.toEqual(b);
  });
});

describe("mulberry32 — seeded RNG sanity", () => {
  it("returns numbers in [0, 1)", () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const n = rng();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it("same seed produces same sequence", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b());
    }
  });
});
