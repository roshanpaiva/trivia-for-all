# Changelog

All notable changes to Trivia for All are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning is MAJOR.MINOR.PATCH.MICRO.

## [0.2.0.0] - 2026-04-28

### Added
- **`src/lib/types.ts`** — shared type definitions: `Question`, `ClientQuestion` (correctIdx and fact stripped — server-only until reveal), `Category`, `Difficulty`, `AttemptMode`, `ScoreRow`. Single source of truth for the schema enforced by the server-authoritative answer rule from the design doc.
- **`src/lib/scoring.ts`** — pure scoring functions:
  - `initialScoreState()`, `onCorrect()`, `onWrong()`, `gameEndReason()`
  - `compareScoreRows()` — leaderboard tiebreaker (correctCount DESC, wrongCount ASC, finishedAt ASC, scoreId ASC) — no random tiebreak
  - Constants: `BASE_CLOCK_MS=90s`, `STREAK_BONUS_5_MS=10s`, `STREAK_BONUS_10_MS=15s`, `MAX_CLOCK_MS=240s`, `MAX_QUESTIONS=20`, `PER_QUESTION_SOFT_CAP_MS=12s`
  - Streak math: 5-in-a-row adds +10s per correct; 10-in-a-row REPLACES with +15s per correct (does NOT stack)
- **`src/lib/sampler.ts`** — `sampleAttemptQuestions(bank, options?)`. Random per-attempt sampling with the 30/50/20 difficulty distribution. **Includes the empty-bucket fallback** (eng review critical gap #2): when a difficulty bucket can't supply its target count, top up from medium → easy → hard so the user never silently gets a shorter game. Includes `mulberry32(seed)` for deterministic test RNG.
- **`src/lib/audio.ts`** — `createAudioService(events?, config?)` factory implementing the Audio Unlock Pattern, voice list refresh, barge-in cancel, visibility pause/resume, SSR-safety, and full mock-injection support for tests.

### Tests (Vitest, 55 new)
- `tests/lib/scoring.test.ts` — 23 tests
- `tests/lib/sampler.test.ts` — 15 tests (including all three empty-bucket variants for the eng review gap)
- `tests/lib/audio.test.ts` — 17 tests with mock SpeechSynthesis + AudioContext + document

### Changed
- `vitest.setup.ts` — polyfills `SpeechSynthesisUtterance` for the jsdom test environment (jsdom doesn't ship a working constructor; the audio service uses `new SpeechSynthesisUtterance(text)` directly).

### Notes
- All 57 tests pass (55 new + 2 smoke from the scaffold). TypeScript strict mode clean. `npm run build` succeeds.
- `src/lib/timer.ts` (in-game state machine: READING → ANSWERING → VALIDATING → REVEAL+FACT → NEXT) is **deferred** to the React-component PR — it's UI-coupled (setInterval, refs, layout effects) and lands cleaner alongside the components that own it.
- **Heads-up about CHANGELOG history:** scaffold (#3, v0.2.0.0) and TTS (#2, v0.1.0.1) were merged into main but their CHANGELOG entries got dropped during the merge resolution. This PR bumps from the current main (`0.1.1.0`) to `0.2.0.0` rather than `0.3.0.0`, and the historical entries are left to be restored in a separate housekeeping PR if desired.

## [0.1.1.0] - 2026-04-28

### Added
- **300 trivia question candidates** fetched from Open Trivia DB (CC BY-SA 4.0) across the 6 v1 categories: general (50), geography (50), science (50), history (50), sports (50), random/animals (50). Difficulty distribution close to the design target: 90 easy / 136 medium / 74 hard. Saved as `src/data/questions-raw.json`.
- **`scripts/fetch-questions.py`** — re-runnable fetcher. Generates a fresh OTDB session token, hits each category once, decodes base64 payloads, dedupes prompts, maps to the project's `Question` schema, writes the raw JSON. ~10 seconds end to end.
- **`scripts/audit-questions.py`** — interactive terminal auditor. Steps through unaudited candidates, lets you keep/skip/edit each, prompts for the `fact` text on keepers, saves after every keep so progress survives crashes. Filterable by category, target-cap (default 200).
- **`src/data/questions.json`** — the **audited** bank (7 exemplar entries to start, with hand-drafted facts as voice/style references). Audit script grows this toward the 200 target.
- **`src/data/README.md`** — schema, audit workflow, what-to-keep criteria, what-to-write-in-fact criteria, re-fetching instructions, license attribution notes.

### Notes
- Audit is the human-judgment pass. Per the design doc estimate, this is ~2 weekends of focused work for a solo dev. Use `python3 scripts/audit-questions.py` to step through it efficiently.
- The 7 exemplar facts in `questions.json` are deliberately safe, widely-verifiable picks across categories (butterflies' six legs, antibiotics vs viruses, EU flag's 12 stars, Rio's Portuguese name, Uranus's Shakespearean moons, sweet potato origins, Sochi 2014 cost). They show what good `fact` text looks like — short, surprising, verifiable, kid-and-adult-friendly.
- Open Trivia DB content requires CC BY-SA 4.0 attribution. App footer + `LICENSE-CONTENT.md` to be added in a subsequent PR.

## [0.1.0.0] - 2026-04-27

### Added
- `DESIGN.md` — design system source of truth: editorial-arcade aesthetic, Cabinet Grotesk + Geist typography, warm cream + burnt orange palette, audio waveform brand mark, motion + a11y baseline, full token spec.
- `CLAUDE.md` — `## Design System` section telling future skill sessions to read `DESIGN.md` before any visual decision.
- `.gitignore` — macOS, Node/Next.js, gstack workspace artifacts.
- `VERSION` and this `CHANGELOG.md` — bump pipeline ready for future ships.

### Notes
- Greenfield project. Next.js scaffolding, test framework, and implementation come in subsequent PRs.
- Planning artifacts (design doc, wireframes HTML, design preview HTML) live in `~/.gstack/projects/roshanpaiva-trivia-for-all/` and are not part of the repo.
