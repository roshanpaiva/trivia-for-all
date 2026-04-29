# `src/data/` — Question bank

Two files live here:

- **`questions-raw.json`** — 300 unaudited candidates from Open Trivia DB across the 6 categories (general, geography, science, history, sports, random/animals). Re-fetchable any time via `python3 scripts/fetch-questions.py`.
- **`questions.json`** — the **audited** bank that ships in v1. Target: 200 hand-audited questions with `fact` text, drawn from the raw candidates. **This is what the app reads at runtime.**

## Schema (per the design doc + `Question` type in `src/lib/types.ts` once added)

```ts
type Question = {
  id: string;                                   // e.g., "geography-12345678"
  category: 'general' | 'geography' | 'science' | 'history' | 'random' | 'sports';
  difficulty: 'easy' | 'medium' | 'hard';
  prompt: string;                               // the question
  choices: [string, string, string, string];   // exactly 4
  correctIdx: 0 | 1 | 2 | 3;                    // server-side only, never sent to client
  fact: string;                                 // 1 sentence, max ~140 chars, read aloud after the answer
  source?: string;                              // 'opentdb' for OTDB-sourced; omit for hand-written
};
```

## Audit workflow

The audit is the human-judgment pass that turns OTDB candidates into a kid-and-adult-friendly set of 200. Allocate ~2 weekends of focused time per the design doc.

### Tooling

```bash
python3 scripts/audit-questions.py              # interactive, all categories, target 200
python3 scripts/audit-questions.py --category geography  # focus on one
python3 scripts/audit-questions.py --target 50  # stop at 50
```

For each candidate, the auditor sees the question + choices + correct answer, then picks:

- `k` — keep, prompts for the `fact` text
- `s` — skip (drop entirely; wrong tone, kid-inappropriate, obscure, factually iffy)
- `e` — edit the prompt before keeping (e.g., to clarify or de-jargon)
- `q` — save and quit (resume later, already-kept candidates are skipped)

Progress saves after every keep, so you can stop anytime and pick up where you left off.

### What to keep

Per the design doc + `DESIGN.md`:

- **Verifiable answers.** If you'd hesitate to defend the answer to a curious 12-year-old, skip.
- **Kid-appropriate.** No violence (drop war / weapons / death), no innuendo, no R-rated pop culture, no politics, no religion.
- **Mixed difficulty within a set.** Aim for 30% easy / 50% medium / 20% hard at the bank level.
- **Both kids and adults can engage.** A 9-year-old should get some right; a 50-year-old shouldn't be bored.
- **Interesting, not trivia-quiz-show-style.** Prefer questions that teach something or surprise.

### What to write in the `fact` field

One short sentence that adds something the question alone doesn't reveal. The fact is read aloud after the answer (correct or wrong) — it's the edutainment payload. Examples:

- "Canberra was chosen as Australia's capital in 1908 as a compromise between rival cities Sydney and Melbourne."
- "Butterflies taste with their feet — chemoreceptors on their legs let them sample a leaf before laying eggs."
- "Antibiotics only work against bacteria, not viruses, which is why they don't help with colds or flu."

Bad facts:
- "The answer is X." (just restates the answer)
- "Nobody knows for sure." (deflates the moment)
- "It was a long time ago." (vacuous)
- "[Long historical paragraph]" (too much; gets cut by audio at 2-3s)

## Re-fetching candidates

If you exhaust the raw bank or want fresh candidates:

```bash
python3 scripts/fetch-questions.py
```

This requests a new OTDB session token, fetches 50 questions per category (different ones than before because of the token), and overwrites `questions-raw.json`. Already-audited entries in `questions.json` are preserved.

## License

Open Trivia DB content is CC BY-SA 4.0. Attribution is in the app footer; full license at `LICENSE-CONTENT.md` (to be added in a subsequent PR alongside the app footer component).
