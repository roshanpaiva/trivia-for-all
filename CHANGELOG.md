# Changelog

All notable changes to Quizzle (formerly "Trivia for All") are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning is MAJOR.MINOR.PATCH.MICRO.

## [0.5.1.1] - 2026-04-29

### Changed
- **TTS rate 1.0 → 1.1.** ~10% faster speech to address "audio reads slowly" feedback. Test fixture updated. Pairs with the 90→120s clock bump from 0.5.1.0 to give the player both more time AND faster reads.

## [0.5.1.0] - 2026-04-29

### Changed
- **Base clock 90s → 120s.** TTS reads on the slower side, which made the original 90s feel too tight. 33% more breathing room without changing streak math (5-in-row +10s, 10-in-row +15s replaces). Cap stays at 240s. All user-facing copy ("90 seconds. As many as you can get.", "90s. Tap fast.", meta description) updated to "120 seconds." Tests use the `BASE_CLOCK_MS` constant so most pass through; one Home test referenced "90s" literally and was bumped.

## [0.5.0.2] - 2026-04-29

### Changed
- **Friendlier exhausted-attempts copy.** Home headline: "Resets in **4h 14m**" → "Try again in **4h 14m**". Kicker: "All done today" → "Daily refresh". PostGame 5/5-used variant: "Resets in 4h 14m" → "Try again in **4h 14m**" (with the time bolded for scanability).
- **`formatCountdown` no longer renders "0h 14m" or "4h 0m"** — drops the zero unit ("14m" or "4h") and falls back to "less than a minute" under 60s. Both Home and PostGame copies updated.

## [0.5.0.1] - 2026-04-29

### Changed
- **`BrandMark` is now `--display-m` size (28px)** instead of 18px. Matches DESIGN.md typography for "section headlines / brand mark". The home header brand was visually undersized after the Quizzle rename.
- **`AudioWaveform` bar heights are percentages, not fixed pixels.** Bars now scale with container height — `className="h-6"` from `BrandMark` actually grows the bars proportionally instead of leaving them stuck at 16px tall in a 24px container.

## [0.5.0.0] - 2026-04-29

### Changed — Renamed to **Quizzle**
- Branding rename. Friendlier, single-syllable, instantly genre-clear, doubles as a memorable URL. Originally "Trivia for All".
- **`BrandMark`:** "Trivia·for·All" → "Qu**izz**le" with the middle "izz" in `--accent` (burnt orange). Waveform mark unchanged — it still pairs naturally as the "voice" indicator.
- **Page title** + meta description: "Quizzle".
- **`package.json` + `package-lock.json` `name`:** `quizzle`.
- Doc references updated cosmetically (README, DESIGN, TESTING, schema header, lib/types header). Historical CHANGELOG entries are left as-is — they record what was true at the time. Planning artifacts under `~/.gstack/projects/roshanpaiva-trivia-for-all/` keep the original folder name (real filesystem path).
- Smoke test now asserts `Quizzle` instead of the three split tokens.

### Notes
- Repo name on GitHub still `trivia-for-all` (rename via Settings if desired — git remote handles redirects automatically).
- Vercel project name still `budapest` / domain still `budapest-eta.vercel.app` (rename via Vercel dashboard if desired).
- No schema/API/runtime behavior change — purely a brand rename + cosmetic docs.

## [0.4.1.1] - 2026-04-29

### Fixed
- **Leaderboard Back link was below the fold.** Was anchored to the bottom with `mt-auto`, which on mobile + a long list pushed it off-screen. Promoted to a top nav row above the "Today" h1 so it's always visible without scrolling. Hover state now uses `--accent` (matches the rest of the design system instead of underlined link styling).

## [0.4.1.0] - 2026-04-29

### Added — Player display names
First-class name capture replaces the `cobalt-otter` auto-handle on the leaderboard. Solves "which one is me?" and gives the leaderboard meaning beyond a single user's session.

- **Schema:** `scores.display_name TEXT` (additive; `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` so re-running `migrate.ts` is safe). Live Neon already migrated.
- **`src/lib/displayName.ts`** — localStorage round-trip + `sanitize()` (trim, 30-char cap, empty → null). Mirrors the same constraint server-side in `db/scores.ts → sanitizeDisplayName`.
- **API:** `POST /api/attempt/finalize` accepts optional `displayName`. Server-side validation always re-runs (never trusts the client value at face). `GET /api/leaderboard` returns `displayName` (preferred) and `isYou` flag for the row matching the caller's cookie.
- **Home screen:** name field shown for first-time visitors and on Edit. Returning visits show "Playing as **<name>** · Edit". Pressing Start with a typed-but-uncommitted name auto-commits it (no orphaned attempts).
- **Leaderboard:** prefers `display_name`, falls back to the auto-handle for older rows or skipped names. The caller's row gets an accent-soft background + a small "you" pill.
- **Scoring service `writeScore`:** `ON CONFLICT DO UPDATE` now uses `COALESCE(EXCLUDED.display_name, scores.display_name)` so a re-finalize without a name doesn't blank an existing one.

### Tests
18 new (165 total): `sanitizeDisplayName` (5), `displayName` localStorage round-trip (4), Home name capture variants (5), `writeScore` displayName persistence (1), `getLeaderboard` displayName surface (1), name-input commit-on-Start (2).

## [0.4.0.3] - 2026-04-29

### Changed
- **Wrong-answer audio is now "Incorrect. The correct answer is X."** instead of "Incorrect. <fact>". Facts can be tangential and don't read well as a correction; the user wants the right answer first and clearest. Correct answers still read "Correct. <fact>" (the fact is the edutainment payload). Soft-cap timeout reads "Out of time." Visible UI unchanged — the fact box still renders for both outcomes.
- **Reveal auto-advance timer mirrors the actual spoken text length.** Was scaling to fact length even when a shorter string is spoken, leaving dead air after the audio finished. Now matches what `useGame` actually speaks.

## [0.4.0.2] - 2026-04-29

### Fixed
- **Wrong answer not visually marked.** The `tappedChoiceIdx` derivation in `InGame` returned `null` whenever the user got it wrong, so the user's selection wasn't shown — only the correct answer turned green. Promoted `tappedChoiceIdx` to `GameState`, set on `tap-answer`, cleared on `reveal-complete`. The wrong-tile red styling now actually fires.

### Added
- **Visible result label on reveal.** Above the choices: green "Correct" or red "Incorrect — the answer was X" (or "Out of time" for soft-cap timeouts). `aria-live="assertive"` so screen readers announce it. Skipped when a streak announcement is showing (those carry their own positive framing).
- **Audio result prefix.** TTS now says "Correct. <fact>" or "Incorrect. <fact>" instead of just the fact, for positive reinforcement on correct + clarity on wrong. Streak announcements unchanged.
- **Game-end audio announcement.** When the clock hits zero or the question pool ends, TTS speaks "Time's up. You got X right." or "All done. You got X right." 150ms delay defends against the existing finalize-effect `audio.cancel()` clipping the start.
- **Running correct/wrong counter** in the in-game top status row. Shows `N correct` always; appends `· M wrong` once any wrongs land. Tabular numerals, color-coded with `--success` / `--error`.

### Notes
- 147 tests pass (1 new regression test for `tappedChoiceIdx` lifecycle: set on tap, survives through reveal, clears on advance). `npm run build` clean.

## [0.4.0.1] - 2026-04-29

### Fixed
- **`useGame` crashed on first dispatch** — `attemptRef` was referenced inside the `useReducer` factory closure but declared below it. Hit JS temporal-dead-zone the moment `dispatch({ type: "start" })` ran. Moved the `useRef` above `useReducer`. Existing unit tests didn't catch this because they call `gameReducer` directly, never via the hook.
- **Start path failed silently on errors** — `useGame.startGame` set `error` and `status: "error"` on failure, but `Home` rendered nothing for either, so users saw a dead button. Added an error banner + `isStarting` label/disabled state on `Home`, wired both from `page.tsx`. Also reset `status` to `"idle"` (not `"error"`) on failure so the user can retry.

### Changed
- **Clock now ticks continuously across all active phases** — previously paused during reading / validating / reveal, only counting down during answering. The reducer + tick loop now decrement the clock for every phase except `idle` and `finished`, matching the "90-second sprint" pressure intent better. New tests cover reading-phase ticks, reveal-phase ticks, and the idle no-tick guard.
- **Reveal auto-advance scaled to fact length** — was a fixed 3.5s timeout, which barge-cancelled long facts (the EU-flag fact takes ~10s of TTS). Now uses the same `~70ms/char + 1.5s` heuristic as the reading phase, with a 3.5s floor and 14s ceiling. Streak announcements get the proportional treatment too.

## [0.4.0.0] - 2026-04-29

### Added
- **`scripts/seed-questions.ts`** — idempotent seed script. Reads `src/data/questions.json`, validates each entry (category/difficulty enums, exactly 4 choices, `correctIdx` in 0..3), upserts into the `questions` table via `INSERT ... ON CONFLICT (id) DO UPDATE`. Re-runnable after every audit pass; never duplicates rows. Auto-loads `.env.local` like `migrate.ts`. Verified against the live Neon DB — 32 audited questions seeded.
- **`src/app/globals.css`** — design token wiring per `DESIGN.md`. CSS custom properties (`--ink`, `--canvas`, `--surface`, `--line`, `--muted`, `--accent`, `--accent-soft`, `--accent-strong`, `--success`, `--error`, plus type/spacing/radii scales) on `:root`, mapped into Tailwind v4's `@theme` so utilities like `bg-canvas`, `text-ink`, `text-accent`, `font-display`, `font-body` resolve to design tokens. `:focus-visible` ring uses `--accent`.
- **`src/app/layout.tsx`** — Cabinet Grotesk loaded via Fontshare CDN (`<link>` in `<head>` + preconnect), Geist via `next/font/google` with all 5 weights (400/500/600/700/800) and `display: swap`. Title + description set to "Trivia for All" / "90 seconds. As many as you can get.". Removed `Geist_Mono` (unused). Body now picks up `bg-canvas text-ink` from the theme.

### Notes
- All 144 tests pass. `npm run build` clean. Dev server confirms Fontshare links resolve + theme tokens render.
- Cabinet Grotesk on Fontshare uses `display=swap` so first paint is Geist; Cabinet Grotesk swaps in once the WOFF2 lands. No FOIT.

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

## [0.3.0.0] - 2026-04-29

### Added
- **Database schema** — `src/db/schema.sql` (idempotent CREATE IF NOT EXISTS for all 5 tables: `questions`, `attempts`, `answers`, `scores`, `notify_signups`) plus a one-shot migration runner at `scripts/migrate.ts`.
- **DB connection layer** — `src/db/client.ts` wraps `@neondatabase/serverless` with a lazy-initialized cached SQL client. Tests inject a fake `SqlTag` via service factory args (no real DB needed for unit tests).
- **Question bank loader** — `src/db/questions.ts` with in-memory cache (eng review D6 decision); one Postgres read per Vercel function instance cold-start, then ~0ms sampling per attempt.
- **Attempts service** — `src/db/attempts.ts`. Includes the **concurrent attempt-start race fix** (eng review critical gap #1): the daily-limit check + insert run in a single SQL statement so two tabs on the same cookie can never both pass a count=4 check and both insert.
- **Answers service** — `src/db/answers.ts` with server-authoritative validation + idempotent retry (duplicate `(attemptId, questionId)` returns the original record without double-counting).
- **Scores service** — `src/db/scores.ts` with idempotent `writeScore` (ON CONFLICT (attempt_id) DO UPDATE) and the leaderboard query (best-per-cookie ranking with stable tiebreakers — no random tiebreak).
- **Notify-me signup** — `src/db/notify.ts` with email validation, idempotent ON CONFLICT (email) DO UPDATE that refreshes personalization fields (cookie, best_score, locale).
- **Cookie identity** — `src/lib/identity.ts`. `getOrMintCookieId()` for routes that mint, `readCookieId()` for routes that read-only.
- **5 API route handlers:**
  - `POST /api/attempt/start` { mode } → attempt + ClientQuestion[] (correctIdx + fact stripped) + attemptsRemaining; 429 on daily_limit_reached
  - `GET /api/attempt/current` → in-progress attempt + answeredCount + currentStreak (computed from per-answer rows)
  - `POST /api/answer` → server-authoritative correct/incorrect + reveal payload; idempotent on retry; 401/403/404/409 for the obvious failure modes
  - `POST /api/attempt/finalize` → server-tallied score + attemptsRemaining; idempotent
  - `GET /api/leaderboard` → top 100 with anonymized handles + yourRank + yourBestToday + totalPlayers
  - `POST /api/notify` → email signup with cookie + best-score-today personalization
- **`@neondatabase/serverless` 1.0.2** dependency added to `package.json`.
- **`src/db/README.md`** — first-time Neon setup, testing pattern, and the concurrent-race fix explained in detail.

### Tests (Vitest, 30 new — 87 total)
- `tests/db/_fakeSql.ts` — small fake SQL tag with substring-fingerprint matching.
- `tests/db/attempts.test.ts` — 9 tests including the explicit verification that the scored INSERT statement contains the count + WHERE filter (the race fix).
- `tests/db/answers.test.ts` — 8 tests including idempotent retry, choice-out-of-range, and question-not-in-attempt rejection.
- `tests/db/scores.test.ts` — 6 tests including ranks with multiple cookies + empty leaderboard + custom limit.
- `tests/db/notify.test.ts` — 7 tests including invalid-email rejection, lowercase-email normalization, ON CONFLICT idempotency.

### Notes
- All tests pass against a mocked `SqlTag`. End-to-end against a real Neon DB requires `DATABASE_URL` to be set + `npx tsx scripts/migrate.ts` to apply the schema. See `src/db/README.md` for the 5-step first-time setup.
- The leaderboard handle (`cobalt-otter` style) is a deterministic FNV-1a hash of the cookie ID. v2 with auth replaces this with the user's chosen display name (D9 from `/plan-design-review`).

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
