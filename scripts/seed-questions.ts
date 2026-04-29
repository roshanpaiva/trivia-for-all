/**
 * Seed the `questions` table from src/data/questions.json.
 *
 * Idempotent — uses INSERT ... ON CONFLICT (id) DO UPDATE so re-running picks
 * up edits to prompt/choices/correctIdx/fact without creating duplicates. Safe
 * to run after every audit pass.
 *
 * Usage:
 *   npx tsx scripts/seed-questions.ts
 *   DATABASE_URL='postgres://...' npx tsx scripts/seed-questions.ts
 */

import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

for (const envFile of [".env.local", ".env"]) {
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
    break;
  }
}

type RawQuestion = {
  id: string;
  category: string;
  difficulty: string;
  prompt: string;
  choices: string[];
  correctIdx: number;
  fact: string;
  source?: string;
};

type Bank = {
  questions: RawQuestion[];
};

const VALID_CATEGORIES = new Set([
  "general",
  "geography",
  "science",
  "history",
  "random",
  "sports",
]);
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

const validate = (q: RawQuestion, idx: number): string | null => {
  if (!q.id) return `entry ${idx}: missing id`;
  if (!VALID_CATEGORIES.has(q.category)) return `${q.id}: invalid category "${q.category}"`;
  if (!VALID_DIFFICULTIES.has(q.difficulty)) return `${q.id}: invalid difficulty "${q.difficulty}"`;
  if (!q.prompt) return `${q.id}: missing prompt`;
  if (!Array.isArray(q.choices) || q.choices.length !== 4) {
    return `${q.id}: choices must be an array of exactly 4 strings`;
  }
  if (!Number.isInteger(q.correctIdx) || q.correctIdx < 0 || q.correctIdx > 3) {
    return `${q.id}: correctIdx must be 0..3, got ${q.correctIdx}`;
  }
  return null;
};

const main = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    console.error("Set it in .env.local (recommended) or in your shell env, then re-run.");
    process.exit(1);
  }

  const dataPath = join(process.cwd(), "src", "data", "questions.json");
  const raw = readFileSync(dataPath, "utf-8");
  const bank = JSON.parse(raw) as Bank;
  const questions = bank.questions ?? [];

  if (questions.length === 0) {
    console.error(`No questions found in ${dataPath}.`);
    process.exit(1);
  }

  const errors = questions
    .map((q, i) => validate(q, i))
    .filter((e): e is string => e !== null);
  if (errors.length > 0) {
    console.error(`Validation failed:\n  - ${errors.join("\n  - ")}`);
    process.exit(1);
  }

  const sql = neon(url) as unknown as <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...params: unknown[]
  ) => Promise<T[]>;
  let upserted = 0;
  for (const q of questions) {
    await sql`
      INSERT INTO questions (id, category, difficulty, prompt, choices, correct_idx, fact, source)
      VALUES (
        ${q.id},
        ${q.category},
        ${q.difficulty},
        ${q.prompt},
        ${JSON.stringify(q.choices)}::jsonb,
        ${q.correctIdx},
        ${q.fact ?? ""},
        ${q.source ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        category    = EXCLUDED.category,
        difficulty  = EXCLUDED.difficulty,
        prompt      = EXCLUDED.prompt,
        choices     = EXCLUDED.choices,
        correct_idx = EXCLUDED.correct_idx,
        fact        = EXCLUDED.fact,
        source      = EXCLUDED.source
    `;
    upserted++;
    if (upserted % 25 === 0) {
      process.stdout.write(`  ...${upserted}/${questions.length}\n`);
    }
  }

  const [{ total }] = await sql<{ total: number }>`
    SELECT COUNT(*)::int AS total FROM questions
  `;
  console.log(`\nUpserted ${upserted} questions from ${dataPath}.`);
  console.log(`Bank now contains ${total} rows total.`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
