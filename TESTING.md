# Testing — Trivia for All

100% test coverage is the goal. Tests let you move fast, trust your instincts, and ship with confidence. Without them, vibe coding is just yolo coding. With them, it's a superpower.

## Stack

- **Vitest 2** — unit + component tests, jsdom environment, `@testing-library/react` for components
- **Playwright 1.59** — end-to-end browser tests, runs against `npm run dev`
- **GitHub Actions** — runs Vitest + Playwright on every push and pull request (see `.github/workflows/ci.yml`)

## Run tests

```bash
npm test                # Vitest, single run (CI mode)
npm run test:watch      # Vitest, watch mode
npm run test:e2e        # Playwright (auto-starts dev server)
```

First-time Playwright setup (download browsers — ~200MB, one-off):

```bash
npx playwright install --with-deps chromium webkit
```

## Layers

| Layer | Tool | Where | When |
|---|---|---|---|
| **Unit** | Vitest | `tests/lib/*.test.ts` | Pure functions: scoring formula, sampler, timer state machine, audio service |
| **Component** | Vitest + Testing Library | `tests/components/*.test.tsx` | React components: choice tile, streak dots, clock, audio waveform |
| **Integration / API** | Vitest | `tests/api/*.test.ts` | Route handlers: attempt lifecycle, answer validation, finalize, leaderboard query, notify-me signup |
| **E2E** | Playwright | `e2e/*.spec.ts` | The four critical user flows: first-time signup, daily limit enforcement, hard network failure recovery, tab close + resume |

The four critical E2E flows are documented in the test plan at `~/.gstack/projects/roshanpaiva-trivia-for-all/roshanpaiva-roshanpaiva-trivia-brainstorm-eng-review-test-plan-*.md`. They MUST pass before `/ship`.

## Conventions

- **Naming:** `tests/<area>/<thing>.test.ts(x)` mirrors `src/<area>/<thing>.ts(x)`. Co-locating tests with source is also fine for tight component-test pairs (e.g., `src/components/Foo.tsx` + `src/components/Foo.test.tsx`).
- **Imports:** use `@/` path alias (e.g., `import Home from "@/app/page"`).
- **Assertions:** prefer `@testing-library/jest-dom` matchers (`toBeInTheDocument`, `toHaveTextContent`, `toBeDisabled`). Don't reach for `toBeDefined()` — assert what the code DOES, not that it exists.
- **External dependencies:** mock at the boundary (DB, API, Web Speech API, AudioContext). Don't ship integration tests that hit production services.
- **Setup / teardown:** `vitest.setup.ts` runs `cleanup()` after each test. Add new global setup there, not per-file.

## Test expectations

- 100% test coverage is the goal — tests make vibe coding safe.
- When writing a new function, write a corresponding test.
- When fixing a bug, write a regression test that proves it stays fixed.
- When adding error handling, write a test that triggers the error.
- When adding a conditional (if/else, switch), write tests for **both** paths.
- Never commit code that breaks an existing test.
- Critical E2E flows (the four named above) must pass before `/ship`.

## Day 0 spike — already-validated assumptions

The Day 0 TTS device spike confirmed browser-native `speechSynthesis` works on iPhone Safari, Android Chrome, Mac Safari, Mac Chrome. Implementation tests can mock the Web Speech API directly without worrying about server-side TTS infrastructure (see `CLAUDE.md` → TTS Strategy).
