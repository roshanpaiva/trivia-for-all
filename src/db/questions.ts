/**
 * Question bank loader with in-memory cache (eng review D6 decision).
 *
 * The bank changes rarely (bulk content updates ship as redeploys), so we hold
 * it in memory at module init. Sampling per attempt is then ~0ms, no DB hit
 * after cold start. Trade-off: new questions require a redeploy to appear.
 *
 * v3 admin UI may add a refresh endpoint; deferred per design doc.
 */

import type { Question } from "@/lib/types";
import { getSql, type SqlTag } from "./client";

let cache: Question[] | null = null;

type QuestionRow = {
  id: string;
  category: string;
  difficulty: string;
  prompt: string;
  choices: string[];
  correct_idx: number;
  fact: string;
  source: string | null;
};

const rowToQuestion = (r: QuestionRow): Question => ({
  id: r.id,
  category: r.category as Question["category"],
  difficulty: r.difficulty as Question["difficulty"],
  prompt: r.prompt,
  choices: r.choices as Question["choices"],
  correctIdx: r.correct_idx as Question["correctIdx"],
  fact: r.fact,
  source: r.source ?? undefined,
});

/**
 * Load the full bank into memory. Idempotent — subsequent calls reuse the cache.
 *
 * @param sql Inject for tests; defaults to production Neon client.
 */
export const loadBank = async (sql: SqlTag = getSql()): Promise<Question[]> => {
  if (cache) return cache;
  const rows = await sql<QuestionRow>`
    SELECT id, category, difficulty, prompt, choices, correct_idx, fact, source
    FROM questions
  `;
  cache = rows.map(rowToQuestion);
  return cache;
};

/**
 * Look up a single question by id. Returns null if not in the bank.
 * Uses the in-memory cache; safe to call inside hot request paths.
 */
export const findQuestion = async (
  id: string,
  sql: SqlTag = getSql(),
): Promise<Question | null> => {
  const bank = await loadBank(sql);
  return bank.find((q) => q.id === id) ?? null;
};

/**
 * For tests only. Reset the cache between tests.
 */
export const __resetBankForTests = (): void => {
  cache = null;
};
