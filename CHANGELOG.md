# Changelog

All notable changes to Quizzle (formerly "Trivia for All") are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning is MAJOR.MINOR.PATCH.MICRO.

## [0.6.13.0] - 2026-05-03

### Added
- **v2 viral loop: share-result button on PostGame + invite-landing banner on Home (DD12).** The cheapest way to find more party-mode players is for the existing party-mode players to send the link. Originally cut from v2.0; brought forward now that party mode is actually being played.
  - **Share button on PostGame** — only renders in party mode when a group name is set. Calls `navigator.share()` on supported browsers (mobile Safari, mobile Chrome), falls back to `clipboard.writeText` everywhere else. Status reflects in the button label ("Sharing…" → "Link copied ✓" or back to default on cancel).
  - **Deep link format** — `https://tryquizzle.com/?party=1&ref=share&group=...&score=...`. Recipients land with party mode pre-selected, NEW-pill auto-dismissed, and an invite banner reading "🎉 The Smiths just got 22 — Beat them." Banner uses the existing `--accent-soft` + `--accent-strong` brand tokens.
  - **Defensive parsing** — `parseInviteParams` strips long group names (30 char cap), rejects negative or implausible scores (> 1000), refuses to render unless `ref=share` is the literal value. Anyone can forge the URL; the parser doesn't trust it past basic sanity.
  - `src/lib/share.ts` — pure helpers (buildShareUrl, buildShareText, shareResult, parseInviteParams). No React, no DOM beyond `navigator.share` / `clipboard`. Fully testable.
- 22 new tests (321 total): URL building + encoding + score clamping, invite parsing happy + 6 reject paths, navigator.share native path + AbortError handling + clipboard fallback + unsupported fallback, PostGame share button render gates + click handler + clipboard status label, Home invite banner render gates.

## [0.6.12.0] - 2026-05-03

### Added
- **+4 audited questions** to `src/data/questions.json` (124 → 128). Mix: 2 easy + 2 medium, 1 history + 3 random. Small audit pass triggered by an 82-correct attempt that suggested the bank is leaning easy. More to come — `python3 scripts/audit-questions.py --category history` is the right next pass.
- **After merge:** run `npx tsx scripts/seed-questions.ts` to push the new rows into prod. Idempotent (`ON CONFLICT (id) DO UPDATE`), safe to re-run.

## [0.6.11.0] - 2026-05-03

### Changed
- **`scripts/stats.ts` reads the new v2 telemetry columns.** Two new sections in the dashboard so we can answer the v2-soft-launch questions from one CLI run:
  - **PLAY MODE** — solo vs party split with completion rates, broken out from the headline FUNNEL. Tells us how much party-mode actually got played in the window.
  - **BROWSER (per attempt)** — server-side `CASE` over the `user_agent` column, classifies each attempt into iOS Safari / iOS Chrome / Android Chrome / Desktop Chrome / etc. Per row: total started, party started, party finalized, average `stt_degrade_count` per party attempt (color-coded — green ≤ 0.1, yellow ≤ 0.5, red above). Plus a one-line "party attempts that degraded to tap-only: X / Y (Z%)" rollup.
  - Pre-telemetry attempts (any row from before v0.6.10.0 deployed) bucket into `unknown (legacy row)` so the labelled rows are clean.
- First read against prod after the v0.6.10.0 telemetry landed: 5 party attempts logged, 0 STT degrades, all four gating browsers already represented in the user_agent column.

## [0.6.10.0] - 2026-05-01

### Added
- **v2 telemetry: `user_agent` + `stt_degrade_count` on attempts.** Captures the browser fingerprint and how often the voice watchdog gave up — so we can answer "did Android Chrome work?" and "what % of party attempts had to fall back to tap?" from the data alone, no separate analytics.
  - Schema (additive, idempotent): `attempts.user_agent TEXT`, `attempts.stt_degrade_count INT NOT NULL DEFAULT 0`. Existing rows get NULL + 0 via DEFAULT. v1 paths unchanged.
  - `/api/attempt/start`: reads `User-Agent` request header, server-side truncates to 255 chars, persists on the attempt row.
  - **New endpoint `POST /api/attempt/[attemptId]/stt-degrade`** — increments the row's degrade count. Cookie-scoped (you can't bump someone else's count). Telemetry-only — no body, no consequential response.
  - **`useStt` `onDegrade` is wired to fire `reportSttDegrade(attemptId)`** through page → InGame. Fire-and-forget client-side; failures are swallowed so flaky telemetry never blocks gameplay.
  - **Migration runs against prod manually** before this PR is merged: `npx tsx scripts/migrate.ts`. After migration, both columns are queryable from `scripts/stats.ts` for Sunday's signal-reading.
- 8 new tests (299 total): user_agent capture + truncation + null fallback, incrementSttDegradeCount UPDATE shape, reportSttDegrade URL encoding + network/5xx swallowing.

## [0.6.9.0] - 2026-05-01

### Added
- **v2 Lane D2: voice answering for Party mode (behind `?party=1`).** Completes the original v2 thesis — group shouts the answer, app recognizes, advances. All gated behind the `?party=1` URL flag + `micPermission==='granted'`. Solo path is byte-identical.
  - **`src/lib/match.ts`** — pure utility, mode-strict matcher (eng D7 + DD7). 3 tiers: exact → substring (with numeral-word equivalence: "twelve" ↔ "12", "nineteen eighty four" ↔ "1984") → per-token Levenshtein (solo Lev 2 forgiving, party Lev 1 strict). Party rejects ambiguous matches (second-best within 1 of best) to avoid the false-positive trust killer the design doc called out.
  - **`src/hooks/useStt.ts`** — wraps `webkitSpeechRecognition`. 3-tier watchdog (eng D4): tier 1 silent-drop restart, tier 2 degrade after 2 fails, tier 3 telemetry hook (`onDegrade` callback). Phases: off / listening / still-listening / degraded. Lazy support detection — no constructor side-effect. Tested with a fake SpeechRecognition (no real browser).
  - **Mic permission flow on Home (DD6).** Inline banner under the mode picker when `partyEnabled && playMode==='party' && micPermission==='unknown'`: "Voice answering needs mic permission. [Allow]". Tap → `navigator.mediaDevices.getUserMedia({audio:true})` → grant hides banner; deny swaps to dismissible "Voice off — tap to answer". Permission state persisted to `quizzle.micPermission` localStorage so the prompt doesn't re-fire on every visit.
  - **Audio surface mic states (DD2 + DD4).** AudioWaveform in InGame's sticky bar reflects the live STT state — `tts-reading` during reading, then `mic-listening` / `mic-still-listening` / `mic-degraded` while the app waits for an answer. Status label tracks state with `aria-live="polite"` (DD12) so screen readers announce it.
  - **Timeout hint (DD5).** When STT has been silent past the still-listening threshold, "Didn't catch that — tap an answer." renders in the existing result-label slot above the choices. Banner only — choices are always tappable, mic stays listening underneath.
  - **`?stt=off` URL escape.** Emergency switch — disables voice answering at runtime without a deploy. Persists to `quizzle.sttDisabled` localStorage.
  - **Solo unaffected.** Voice answering only fires when every gate is satisfied (`partyEnabled && playMode==='party' && micPermission==='granted' && !sttDisabled`). Solo plays exercise zero new code paths.
- 57 new tests (291 total). matchAnswer covers 3 tiers + numerals + years + edge cases. useStt covers happy path + watchdog + idempotency + lazy support detection. Home covers banner render gates + Allow button + denied-banner dismissal.

## [0.6.8.1] - 2026-05-01

### Fixed
- **Party mode now forces a group name (no carryover from solo).** First production feedback after Lane D1: a user with solo name "Alex" who tapped Party kept "Playing as Alex", which would land on the leaderboard as a group score. Wrong attribution. Now:
  - Solo and party identities live in separate localStorage slots — `tfa.displayName` (solo, unchanged) and `quizzle.groupName` (party, new).
  - Switching to Party with no group name set → input field opens, Start is disabled, hint copy reads "Name your group above to play."
  - Switching back to Solo → solo name is intact (was never overwritten).
  - Group name persists per device, so returning party players don't have to retype "The Smiths" every visit.
- This fixes the carryover friction we shipped as known UX debt in Lane D1 (DD7 was deferred to v2.1; brought forward when real users hit it on day 1).
- 6 new tests (234 total): independent solo/party slot round-trips, Start gating in party-mode-no-group, summary rendering when group is set, party-mode hint copy.

## [0.6.8.0] - 2026-05-01

### Added
- **v2 Lane D1: party mode tap-only (behind `?party=1`).** First user-visible party-mode UI. Voice answering arrives in D2; this PR ships the complete tap-only experience so we can read engagement signal before betting on STT.
  - **Mode picker** on Home — pill-segmented control between attempts-pill and Start CTA. `--ink` filled active, `--r-pill` radius (DD11). Solo / Party labels (DD13). One-time NEW pill on Party tab using the `--accent-soft` + `--accent-strong` pattern (DD9), dismissed in localStorage on first interaction with the picker.
  - **Conditional name field** — Party mode swaps label to "Group name" + placeholder to "e.g. The Smiths" (DD7). Same column underneath (eng D1).
  - **Party leaderboard sections** — "Today's groups" + "All-time groups" stacked below the existing solo sections (DD3). Empty state copy IS the v2 invitation moment ("be the first").
  - **`?party=1` URL gate** — once visited with the flag, persisted to localStorage so a returning visitor on the same device sees the picker without re-pasting the URL. v1 users without the flag see byte-identical Home + leaderboard (verified visually).
  - **Pass `playMode` through to `startAttempt`** — `useGame.startGame(attemptMode, playMode?)` accepts an optional second arg, defaulting to `'solo'` for v1 callers. page.tsx wires the active mode in.
- **v1 byte-identical when partyEnabled=false.** Locked in by a regression test (`tests/components/Home.test.tsx`) that asserts the original "Name or team name" label + "e.g. Alex, or The Smiths" placeholder render unchanged when the URL flag isn't set. Caught a copy regression mid-flight via the dev-server screenshot pass.
- 14 new tests (228 total): mode picker render gate, aria-selected, tab interaction, NEW pill visibility, conditional label, party leaderboard sections, party Krug-pin, v1 regression lock.

## [0.6.7.0] - 2026-05-01

### Added
- **v2 Lane C: API + DB plumbing for `playMode` (backward-compatible).**
  - `PlayMode` type added (`"solo" | "party"`), orthogonal to `AttemptMode`.
  - `attempts.startAttempt` accepts `playMode` (default `"solo"`); INSERT now writes the column. SELECT projections in `findCurrentAttempt` and `findAttempt` return `play_mode` so the `Attempt` type carries it through.
  - `scores.writeScore` accepts `playMode`; INSERT writes it. Denormalized from the attempt row at finalize time per eng D6 — leaderboard queries stay single-table.
  - `getLeaderboard` and `getAllTimeLeaderboard` now require a `playMode` filter (forces caller to think; per DD3 solo and party are separate stacked sections, never mingled).
  - `/api/attempt/start`: accepts `{ attemptMode, playMode }` (new) AND `{ mode }` (legacy alias). Server reads `attemptMode ?? mode`, defaults `playMode` to `"solo"`. Response carries both `mode` and `attemptMode` for the same backward-compat reason. Mid-game tabs running pre-Lane-C JS keep working.
  - `/api/attempt/finalize`: reads `playMode` from the attempt row (not the request body — single source of truth) and passes it to `writeScore`.
  - `/api/leaderboard`: now runs four queries (solo today + solo all-time + party today + party all-time) in parallel. Top-level fields (`top`, `allTime`, etc.) narrow to solo-only. New `party.today` and `party.allTime` carry the party-mode equivalents — empty arrays until the first party play lands. Old clients ignore the new field.
  - Daily 5-attempt cap counts solo + party together (DD14: shared cap, single paywall in v2.1). The COUNT subquery in the conditional INSERT does NOT filter by play_mode; verified by a regression test.
- **Lane C requires Lane A's migration to be live in prod before merge.** The new INSERT statements list `play_mode` explicitly; without the column they would 500.
- 9 new tests added (214 total): playMode persistence on writeScore + startAttempt, default-to-solo back-compat, mode-shared cap regression, party-filter on both leaderboard queries, party-section parsing in the API client, party-mode startAttempt request shape.

## [0.6.6.0] - 2026-05-01

### Added
- **v2 Lane B: AudioWaveform extended with 4 mic states** (per design DD2 + DD4). The component is the single audio mark for both halves of the audio loop — TTS output and STT input — never on screen at the same time.
  - `state="off"` → bars static in `--ink` (default; v1 inactive look)
  - `state="tts-reading"` → bars vary height per syllable in `--accent` (v1 active look, byte-identical)
  - `state="mic-listening"` → uniform-height bars pulse opacity 100% → 60% in `--ink` (0.9s cycle)
  - `state="mic-still-listening"` → uniform pulse 80% → 40% (1.8s, signals fade)
  - `state="mic-degraded"` → uniform bars static in `--muted` (voice off; tap-only)
- **Backward compatible.** Legacy `active` prop (BrandMark + InGame call sites) still works — `active=true` resolves to `tts-reading`, `active=false` resolves to `off`. Visual output for v1 callers is byte-identical.
- **`state` takes precedence over `active`** when both are provided — lets new code adopt the new prop without accidentally fighting legacy callers.
- **Reduced-motion respected** — all three keyframes (`wave-pulse-tts`, `wave-pulse-listen`, `wave-pulse-listen-slow`) disabled under `prefers-reduced-motion: reduce`. Replaces with the static-bars rendering DD12 specified.
- 14 new tests (205 total). No call sites are switched to the new `state` prop yet — Lane D will wire it up when the InGame phase machine learns about party-mode listening states.

## [0.6.5.0] - 2026-05-01

### Added
- **v2 Lane A: additive `play_mode` columns on `attempts` + `scores`.** First step in the v2 party-mode build. Both tables get `play_mode TEXT NOT NULL DEFAULT 'solo' CHECK (play_mode IN ('solo','party'))`. Existing rows backfill to `'solo'` via the column default. Idempotent (`ADD COLUMN IF NOT EXISTS`).
- **Backward-safe by design.** No code reads or writes `play_mode` yet — Lane C will. Existing INSERTs that don't specify the column get `'solo'`. v1 solo plays are byte-identical in behavior. The 191 existing tests still pass with zero changes.
- **Per-lane shipping plan (per the v2 guardrails).** Lane A = schema only. Lane B = AudioWaveform extension (default solo state unchanged). Lane C = API additions (backward-compatible field handling). Lane D = UI behind `?party=1` URL gate. Each lane stands alone — any one merging without the others does not break v1.
- **Migration is run manually:** after merge, `npx tsx scripts/migrate.ts` against the production Neon DB picks up both new columns. The migration script is already idempotent, so re-running it is safe.

## [0.6.4.0] - 2026-04-30

### Added
- **Personal best on Home + All-time top 10 on Leaderboard.** User feedback: a kid got 26, came back the next day, and his score was gone from the leaderboard. With the daily reset, pride evaporates at midnight UTC. Now:
  - Home shows `Best today: X · Personal best: Y` inline below the brand mark. Personal best persists across the daily reset.
  - Leaderboard adds a stacked "All time" section below "Today" showing the top 10 highest scores ever, with the same Krug-rule pinning ("you" pinned at the bottom if outside top 10).
  - A returning-next-day visitor (fresh attempts but already has a personal best) no longer sees the first-time how-to-play copy — personal best disambiguates.
- New DB query: `getAllTimeLeaderboard({ cookieId, limit })` mirrors `getLeaderboard` but with no date filter. Same tiebreakers (correct DESC → wrong ASC → finished_at ASC). Display name picks the most-recent non-null name per cookie (so renamed players show under their current handle).
- API: `/api/leaderboard` response gains `yourPersonalBest: number | null` and `allTime: { top, yourRank }`. Anonymous (no-cookie) callers get `null` for caller fields.
- 22 new tests (191 total). Schema unchanged — pure read-side feature on the existing `scores` table.

## [0.6.3.1] - 2026-04-30

### Changed
- **Snappier reveal-to-next-question gap.** User feedback: "once it reads the correct or incorrect answer, there's too long a gap before the next question." The reveal-advance timer was tuned for 1.0× TTS rate but we bumped to 1.1× a while back, so estimates ran long. Plus the post-speech padding was generous.
- New constants: `ms = min(12000, max(2500, spoken.length * 55 + 500))`. Was `min(14000, max(3500, spoken.length * 70 + 1500))`.
- Concrete deltas:
  - "Correct." (8 chars) → 2500ms (floor) — was 3500ms. **−1.0s**
  - "Incorrect. The correct answer is Banana." (~40 chars) → 2700ms — was 4300ms. **−1.6s**
  - "Correct. \<medium-length fact\>" (~80 chars) → 4900ms — was 7100ms. **−2.2s**
  - Long fact (~120 chars) → 7100ms — was 9900ms. **−2.8s**
- 173 tests still pass; the timing constants live inside a useEffect and aren't asserted directly by any test.

## [0.6.3.0] - 2026-04-30

### Added
- **`scripts/stats.ts`** — read-only CLI dashboard against the live Neon DB. Run `npx tsx scripts/stats.ts` for today's metrics, or `--days 7` for the last 7 days. Outputs:
  - Funnel (distinct players, attempts started, finalized, completion %, median duration)
  - Score distribution (avg, median, P90, max, lockouts hit)
  - Difficulty calibration (per-band hit rate + difficulty index 1-3)
  - Returning-cookie rate (windows ≥ 2 days)
  - Top 5 hardest + top 5 easiest questions in window (audit signal for re-tagging or removal)
  - Bank state (total + per-difficulty distribution)
- All metrics computed from existing schema — no new tracking, no new tables. Just SQL aggregations on `attempts`/`scores`/`answers`/`questions`. No PII surfaces (only aggregates and prompt text).
- First real read against production: 16 distinct players in 7 days, 74% completion, ~50% hit rate across all 3 difficulty bands (the "it's hard" complaint was the random shuffle, not the bank — fixed in 0.6.2.0). 4 cookie-days hit the 5/5 lockout — real signal for v2.1 monetization.

## [0.6.2.0] - 2026-04-30

### Fixed
- **Difficulty curve: easy questions front-loaded.** Real-user feedback before this change: "lots of folks come back saying it was very hard." The sampler was picking 30/50/20 easy/medium/hard but then **fully shuffling all 100 questions**, so a hard question could land at Q3 in many attempts. First impression broken.
- New ordering: easy → medium → hard, randomized within each band. Same totals, same distribution, just front-loads momentum builders. The clock-pressure sprint now has a real difficulty curve instead of a roulette wheel.
- `src/lib/sampler.ts`: replaced final `shuffle(picks)` with `orderByDifficultyCurve(picks)` which groups by difficulty and shuffles within each band before concatenating.
- 4 new tests in `tests/lib/sampler.test.ts` covering: first 30 are easy, last 20 are hard, difficulty indices non-decreasing, top-up fallback respects the curve. 173 tests total pass.

## [0.7.0.0-spike] - 2026-04-30

### Added — V2 Speech Recognition Spike (TEMPORARY)
- **`src/app/spike/page.tsx`** — internal test page at `/spike` (undocumented, not linked anywhere). Tests `webkitSpeechRecognition` on iPhone Safari + Android Chrome to decide whether voice-first party mode is shippable for v2. Per the v2 design doc (`~/.gstack/projects/roshanpaiva-trivia-for-all/...-audit-bank-124-design-*.md`).

Five tests, each running locally against the spec's gates:
- T1 single-word recognition (5 trials, ≥90% / <500ms)
- T2 multi-word answers (5 trials, ≥90%)
- T3 numbers / years (5 trials, ≥80% with number-form tolerance)
- T4 concurrent TTS+STT (the killer iOS Safari case — same words as T1, but TTS prompts before each)
- T5 multi-question loop (10 prompts back-to-back, watches for silent drops)

Results saved to localStorage and exportable as JSON. **This page should be removed after the spike completes** (post-v2 decision). It's not in the sitemap, robots, or any nav.

### Notes
- VERSION suffix `-spike` flags this as a research-only release. The 0.7.0.0 slot is reserved for the actual v2 ship; if the spike informs a different decision, this VERSION will be replaced.
- 169 tests still pass. Build clean. New `/spike` static route registered.

## [0.6.1.1] - 2026-04-30

### Fixed
- **"View leaderboard" on Home (exhausted variant) started a practice game.** When `attemptsRemaining === 0`, the secondary CTA's label flipped to "View leaderboard" but its `onClick` still called `handleStart("practice")`. Replaced with an `<a href="/leaderboard">` styled to match the button. Added a regression test asserting the element is a real link, not a click handler.

## [0.6.1.0] - 2026-04-30

### Fixed
- **Game stopped at 20 questions even with time left.** `sampler.TOTAL_PER_ATTEMPT` was 20 and `scoring.MAX_QUESTIONS` was 20. Bumped both to 100 so the clock is the natural game-end. With 120s + bonus time and ~6-10s per question, a player tops out around 30-40 — 100 gives plenty of headroom and lets the clock actually be the pressure mechanic. Sampler still clamps to bank size when fewer than 100 audited questions exist.
- **"5 of 5 attempts left" always shown on Home.** `attemptsRemaining` defaulted to 5 in client state and only updated after a finalize round-trip. `GET /api/leaderboard` now returns `yourAttemptsRemaining` (computed from `countScoredAttempts(cookieId, today)`); page.tsx hydrates from it on mount. Anonymous callers still get 5.

### Added
- **🤓 Brainiac end-screen** when the player runs the entire shuffled question pool (rare). PostGame shows a celebratory banner — "Wow, you're a real brainiac! You answered every question we have. We're refreshing the bank — come back soon, we'll be ready." TTS announces "Wow, you ran the table!" too. Triggered when `endReason === "max-questions"`.
- **`endReason` plumbed from `useGame.state` through `page.tsx` to `PostGame`** as a typed prop so the celebratory branch can fire.

### Changed
- PostGame copy: "correct in 90s" → "correct in 120s" (matches the 0.5.1.0 clock bump that this label missed).

### Tests
Sampler test fixtures bumped proportionally (50 → 200 in single-bucket cases; small fixtures expanded so `TOTAL_PER_ATTEMPT` assertions hold). 168 tests still pass.

## [0.6.0.0] - 2026-04-30

### Added — Share-with-friends ready
- **`LICENSE-CONTENT.md`** at repo root — CC BY-SA 4.0 attribution + ShareAlike notice for the OTDB-derived question bank. Keeps the project legally clean for public sharing.
- **`Attribution` component** — small footer line "Questions from Open Trivia DB · CC BY-SA 4.0" with links. Mounted on `Home`, `PostGame`, and `Leaderboard` (every public surface).
- **OG / Twitter card metadata** in `app/layout.tsx`. Shared links now render with title + description + image preview in iMessage / Slack / WhatsApp / Twitter / etc. `metadataBase` set to `https://tryquizzle.com`. Title template `%s · Quizzle` + default `Quizzle — 120s sprint trivia`.
- **`app/opengraph-image.tsx`** — code-generated 1200×630 OG image at `/opengraph-image`. Warm cream canvas, BrandMark up top with the burnt-orange "izz" + 5-bar waveform, hero copy "120 seconds. As many as you can get." with the design-system tokens, footer with `tryquizzle.com` and tagline. Edge-rendered at build time; no font fetch needed (system fonts only).

### Notes
- `tryquizzle.com` (apex + www) verified live with HTTPS, redirects HTTP→HTTPS, www→apex. Vercel deploy already pointing at it.
- 77 audited questions live in Neon (up from 32 last session). Distribution: ~36/47/17% easy/medium/hard, heavy on general+geography for now — `sampler.ts` empty-bucket fallback handles the skew gracefully.

## [0.5.3.0] - 2026-04-29

### Changed — Layout fills viewport on every screen
Removed the `mx-auto max-w-[420px]` column constraint from `Home`, `InGame`, `PostGame`, and `Leaderboard`. Content now fills the available width with the `px-5` padding intact.

- On phone: identical to before (viewport ~375-430px ≈ the old 420px column)
- On tablet/desktop: content fills the screen instead of sitting in a centered narrow column with whitespace on both sides

User feedback: "the .mx-auto style was the problem; without it, it looks better".

### Notes
- The 76px-tall hero CTAs do stretch wide on a desktop browser. If that ends up looking wrong, the next step is a width-aware ceiling (e.g., `max-w-[640px]` + `mx-auto` back) — but per the user's reference screenshot, full-bleed is the desired direction.

## [0.5.2.2] - 2026-04-29

### Changed — PostGame: hero treatment matches Home
After bumping Home typography in 0.5.2.1, the PostGame felt undersized by comparison. Same scale-up rules applied.

- **Best-today card:** `p-5 → p-6`, value text `text-[22px] font-bold → text-[32px] font-extrabold`, "Best today" label gets `uppercase tracking-[0.12em]` to match the kicker pattern, "— new best!" rendered at `text-[20px]` (was inheriting parent size).
- **Play another CTA:** `min-h-[64px] text-[22px]` → `min-h-[76px] text-[28px]`. Matches Home Start button.
- **Practice CTA:** `min-h-[56px] text-[18px]` → `min-h-[68px] text-[22px]`. Matches Home secondary practice.

The 420px column constraint is unchanged — same as Home/InGame/Leaderboard for visual consistency. If we want elements to fill wide screens (tablet/desktop), that's a separate design decision.

## [0.5.2.1] - 2026-04-29

### Changed — Home: poster-sized typography
User feedback against a target reference image — the home felt cramped relative to the design intent.

- **Headline:** `text-[28px]` → `text-[40px]` `font-extrabold` `leading-[1.05]`. Matches DESIGN.md `--display-l` (36px / 800) with a small bump for hero impact.
- **Headline kicker spacing:** `mb-1` → `mb-2`. Headline block `mb-6` → `mb-7`.
- **Start CTA:** `min-h-[64px]` → `min-h-[76px]`, `text-[22px]` → `text-[28px]`. Same applied to the exhausted-variant Practice primary CTA.
- **Secondary Practice CTA:** `min-h-[56px]` → `min-h-[68px]`, `text-[18px]` → `text-[22px]`.
- **"Playing as <name> · Edit":** `text-[14px]` → `text-[18px]`, `mb-4` → `mb-5`.
- **Status pill:** `text-[14px]` → `text-[15px]`, `px-3 py-1` → `px-4 py-1.5`, `mb-4` → `mb-5`.

## [0.5.2.0] - 2026-04-29

### Changed
- **Name required for scored play.** Start button is disabled when no display name is set (in input or localStorage). Helper hint: "Add your name above to play scored. Practice mode below works without one." Solves leaderboard rows with anonymous "wise-harbor" auto-handles for new users who skipped the input.
- **🔥 On-a-roll indicator.** Persistent badge in the in-game top section while `streak >= 5` ("🔥 On a roll"), with `--accent-soft` background. Disappears the moment the streak resets to 0.
- **💔 Bonus streak lost message.** When a wrong answer breaks a `>=5` streak, a small "💔 Bonus streak lost" line shows during the reveal. Reducer tracks `bonusStreakLost` on `RevealResult`.
- **In-game layout fits viewport — sticky top bar.** Status row + Clock + streak indicator are now in a `sticky top-0` bar so they're always visible regardless of scroll. Body shrinks slightly (text-22 → text-20 for prompt + result label, mt-4 → mt-3 on fact box) so 4 choices + fact + sticky header fit on iPhone SE without scrolling. Replaces the prior layout where scrolling for the fact pushed the timer off-screen.
- **PostGame "Saving your score…" loading state** between game-end and finalize-resolved. Was falling through to Home, which flashed the name-input + Start CTA briefly. Now renders a quiet centered loader during the API roundtrip (typically 200-500ms).
- **Best-today card width parity:** added explicit `w-full`, bumped padding `p-4 → p-5`, `rounded-md → rounded-lg` to match the visual weight of the Start/Resume buttons.

### Tests
3 new (168 total): Start disabled when no name set, `bonusStreakLost` true on streak break, `bonusStreakLost` false otherwise.

## [0.5.1.2] - 2026-04-29

### Fixed
- **Home header: brand mark and status text were squashed together.** The header was a `flex items-center justify-between` row with both children inline — fine when BrandMark was 18px, cramped after the 28px bump (especially on narrow phones where the first-time copy "120s. Tap fast. Streaks add bonus time." had no room). Stacked vertically: BrandMark on top, status copy on its own line with `mt-2` spacing.

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
