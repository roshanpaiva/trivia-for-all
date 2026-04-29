# Quizzle

A 120-second sprint trivia game for kids and adults at the same table. Audio-first, daily leaderboard, edutainment. (Originally codenamed "Trivia for All" — renamed at v0.5.0.0; planning artifacts in `~/.gstack/projects/roshanpaiva-trivia-for-all/` keep the original path.)

> Memorable thing: **"Learning when it doesn't feel like learning."**

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Vitest · Playwright · Vercel.

## Get started

```bash
npm install
npm run dev          # http://localhost:3000
```

## Test

```bash
npm test             # Vitest unit + component tests
npm run test:e2e     # Playwright integration tests (requires browsers — `npx playwright install` first time)
```

## Documentation

- **`DESIGN.md`** — design system source of truth (typography, color, spacing, motion, brand voice, a11y baseline). Read this before making any visual decision.
- **`CLAUDE.md`** — agent + workflow guidance, including TTS Strategy (browser-native, decided in Day 0 spike) and skill routing.
- **`AGENTS.md`** — Next.js-specific guidance for AI agents (this is Next.js 16, not the version your training data knows about).
- **`CHANGELOG.md`** — versioned release history.

## Project layout

```
src/app/         Next.js App Router pages and route handlers
src/components/  React components (small, focused — see CLAUDE.md conventions)
src/data/        Question bank JSON (200 hand-audited questions, expand via OpenTriviaDB seed)
src/lib/         Core libraries: scoring, timer, sampler, audio service
public/          Static assets
tests/           Vitest unit/component tests (mirror src/ structure)
e2e/             Playwright E2E tests (4 critical flows: first-time signup, daily limit, hard network failure, tab close + resume)
```

Detailed architecture, scoring formula, attempt lifecycle, and database schema live in the design doc at `~/.gstack/projects/roshanpaiva-trivia-for-all/`.

## Deploying

Auto-deploys to Vercel on push to `main`. No GitHub Actions needed for deploy at v1.
