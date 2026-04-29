# Changelog

All notable changes to Trivia for All are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning is MAJOR.MINOR.PATCH.MICRO.

## [0.3.0.0] - 2026-04-29

### Added
- **`src/lib/timer.ts`** — pure-function game state machine with `gameReducer` and 7 event types (`start`, `reading-complete`, `tap-answer`, `soft-cap-elapsed`, `validation-result`, `reveal-complete`, `tick`, `pause`, `resume`). Implements the READING → ANSWERING → VALIDATING → REVEAL → NEXT loop from the design doc. Pure: no setInterval. The hook owns the tick loop. Per D2 from `/plan-eng-review`: client owns the clock at v1.
- **`src/lib/api.ts`** — typed fetch client for the backend routes: `startAttempt`, `getCurrentAttempt`, `submitAnswer`, `submitAnswerWithRetry` (10-retry / 3s backoff per D6 from `/plan-design-review`), `finalizeAttempt`, `getLeaderboard`, `signupForNotify`. `ApiError` class with `code` field for branchable error handling.
- **`src/hooks/useAudio.ts`** — React adapter around `createAudioService`. Owns lifecycle (unlock once, teardown on unmount).
- **`src/hooks/useGame.ts`** — game loop hook. Owns the timer reducer + 100ms tick loop (only ticks during `answering`) + 12s soft-cap timer + API calls + audio wiring. Components stay simple — they render based on `state.phase`.
- **Components (`src/components/`):**
  - `BrandMark` — Trivia·for·All + audio waveform
  - `AudioWaveform` — 5-bar mark, animates when audio active, respects `prefers-reduced-motion`
  - `Clock` — big mm:ss display, tabular numerals, +10s/+15s flying number animation
  - `StreakDots` — segmented progress dots toward next bonus (D4 from `/plan-design-review`)
  - `ChoiceTile` — phase-driven button styling (reading/answering/validating-this/validating-other/reveal-correct/reveal-wrong/reveal-other) per D7
  - `PauseOverlay` — hard network failure recovery with auto-retry + manual button + escalation copy at retry cap (D6)
  - `Home` — three variants: first-time (D5 how-to-play in the slot), returning user, 0/5-used with practice CTA + reset countdown (D8)
  - `InGame` — composes Clock + StreakDots + ChoiceTile, owns keyboard nav (1-4 keys), auto-advances reveal after 3.5s, reading after a proportional length, calls back on tap
  - `PostGame` — score reveal + best card + "Play another" / "Practice mode" CTAs; 5/5-used variant adds the Notify-me email form with GDPR-friendly copy
  - `Leaderboard` — three explicit UI states (loading skeleton, empty Day-1, error), top 100 + your rank pinned at the bottom (Krug rule)
- **Pages:**
  - `src/app/page.tsx` — top-level GamePage, switches between Home / InGame / PostGame based on `useGame.status` + `state.phase`. Replaces the placeholder from PR #3.
  - `src/app/leaderboard/page.tsx` — server-rendered shell for the Leaderboard component.

### Tests (Vitest, 32 new — 114 total)
- `tests/lib/timer.test.ts` — 14 tests: every phase transition, tick decrement only in answering, barge-in path, streak announcement boundaries, time-out and max-questions end conditions, soft-cap-elapsed, ignored events in wrong phase.
- `tests/lib/api.test.ts` — 14 tests: every typed function, ApiError shape on every status code, `submitAnswerWithRetry` retries 5xx but NOT 4xx (user fault), gives up after maxRetries.
- `tests/components/StreakDots.test.tsx` — 5 tests: 0/3/5/7/12 streak counts, aria-label content per state.
- `tests/components/Home.test.tsx` — 6 tests: first-time / returning / 0-used variants, Start + Practice click handlers, resumable button label.
- `tests/components/Clock.test.tsx` — 8 tests: format mm:ss, pad, round-up, clamp negative, bonus rise visibility, aria-label.
- `tests/components/ChoiceTile.test.tsx` — 9 tests: every ChoiceState renders correctly, click disabled when not tappable.

### Notes
- `tests/smoke.test.tsx` updated: the original asserted the placeholder page text from PR #3, but `src/app/page.tsx` is now a client component with hooks (would need fetch mocking to render). Smoke now asserts BrandMark renders — proves the test pipeline + Tailwind + `@/*` aliases all work end-to-end.
- All 114 tests pass. TypeScript strict mode clean. `npm run build` succeeds, registers `/`, `/leaderboard`, and `/_not-found`.
- **Heads-up about merge order with PR #6 (backend):** Lane B branched off origin/main when main was at v0.2.0.0 (after PR #5 merged). Lane A (PR #6) bumps to 0.3.0.0 too. If PR #6 merges first, this PR needs a trivial 3-way merge on VERSION + CHANGELOG (and a probable bump to 0.4.0.0 or 0.3.1.0).
- **Components don't render against a real backend yet** — until PR #6 merges + Neon is provisioned + the question bank is seeded, `npm run dev` will show the home but `Start` will fail. Component tests cover the rendering surface; E2E coverage lands once both PRs merge and Neon is live.

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
