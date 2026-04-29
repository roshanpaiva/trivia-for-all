# Changelog

All notable changes to Trivia for All are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning is MAJOR.MINOR.PATCH.MICRO.

## [0.2.0.0] - 2026-04-28

### Added
- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 scaffolded via `create-next-app`. `src/` directory layout with `@/*` import alias.
- Placeholder home page at `src/app/page.tsx` rendering the brand mark + "Coming soon. 90 seconds. As many as you can get." (real game UI lands in subsequent PRs).
- **Vitest 2** for unit + component tests, jsdom environment, `@testing-library/react` configured. One smoke test (`tests/smoke.test.tsx`) covers the home page.
- **Playwright 1.59** for E2E. Config targets desktop Chromium + iPhone 14 (mobile Safari emulation). One smoke spec (`e2e/smoke.spec.ts`).
- `TESTING.md` documents the testing philosophy, layers, conventions, and run commands.
- `CLAUDE.md` gains a `## Testing` section pointing at TESTING.md and stating the test expectations.
- `.github/workflows/ci.yml` runs Vitest + Next.js build on every push and PR; runs Playwright E2E on a separate job and uploads the report as an artifact.
- `AGENTS.md` (kept from create-next-app) flags that this is Next.js 16, not the version your training data knows about.
- README.md rewritten with stack, get-started commands, testing commands, project layout.

### Notes
- Day 0 TTS spike result (browser-native speechSynthesis) committed separately on `roshanpaiva/day-0-tts-spike` → PR #2. If that PR merges before this one, the TTS Strategy section in CLAUDE.md will need a trivial 3-way merge (this PR adds `## Testing`, that PR adds `## TTS Strategy`).
- `npm test` runs Vitest. `npm run test:e2e` runs Playwright (first-time needs `npx playwright install --with-deps chromium webkit`).
- `npm run build` succeeds. TypeScript type-checks cleanly. Vitest passes 2/2.

## [0.1.0.0] - 2026-04-27

### Added
- `DESIGN.md` — design system source of truth: editorial-arcade aesthetic, Cabinet Grotesk + Geist typography, warm cream + burnt orange palette, audio waveform brand mark, motion + a11y baseline, full token spec.
- `CLAUDE.md` — `## Design System` section telling future skill sessions to read `DESIGN.md` before any visual decision.
- `.gitignore` — macOS, Node/Next.js, gstack workspace artifacts.
- `VERSION` and this `CHANGELOG.md` — bump pipeline ready for future ships.

### Notes
- Greenfield project. Next.js scaffolding, test framework, and implementation come in subsequent PRs.
- Planning artifacts (design doc, wireframes HTML, design preview HTML) live in `~/.gstack/projects/roshanpaiva-trivia-for-all/` and are not part of the repo.
