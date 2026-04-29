# CLAUDE.md

This file provides context and guidance for AI agents working in this repository.

## Project

A trivia game for all audiences. Built as a greenfield Next.js project.

> 🚧 Product details, feature scope, and target audience to be defined via gstack planning sessions.

## Tech Stack

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Package Manager**: npm

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools directly.

Available gstack skills:
- `/plan-ceo-review` — high-level product planning and review
- `/plan-eng-review` — engineering planning and review
- `/ship` — implementation and shipping
- `/browse` — web browsing
- `/qa` — quality assurance
- `/review` — code review
- `/retro` — retrospective

## Workflow

- Plan before building — use `/plan-ceo-review` and `/plan-eng-review` before writing code
- Follow TDD where practical — write tests before implementation
- Keep commits small and descriptive
- Use feature branches for all new work

## Conventions

- Use TypeScript throughout — no `any` types
- Components go in `src/components/`
- Pages go in `src/app/`
- Keep components small and focused

## Testing

Read `TESTING.md` before writing or changing tests. Stack: Vitest 2 (unit + component, jsdom env, `@testing-library/react`) + Playwright 1.59 (E2E). CI runs both on every push and PR via `.github/workflows/ci.yml`.

Run command: `npm test` (Vitest) and `npm run test:e2e` (Playwright). First-time Playwright needs `npx playwright install --with-deps chromium webkit`.

Test expectations:
- 100% test coverage is the goal — tests make vibe coding safe
- When writing a new function, write a corresponding test
- When fixing a bug, write a regression test
- When adding error handling, write a test that triggers the error
- When adding a conditional (if/else, switch), write tests for both paths
- Never commit code that breaks an existing test
- Critical E2E flows (first-time signup, daily limit enforcement, hard network failure recovery, tab close + resume) must pass before `/ship`

The four critical E2E flows are documented in the test plan at `~/.gstack/projects/roshanpaiva-trivia-for-all/roshanpaiva-roshanpaiva-trivia-brainstorm-eng-review-test-plan-*.md`.

## Design System

Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, motion, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match `DESIGN.md`.

## TTS Strategy

**Decision (Day 0 spike, 2026-04-28): browser-native `speechSynthesis` is the v1 audio path.**
No server-side TTS infrastructure, no pre-cached MP3s, no provider account.

### What the spike tested

Manual test page (`/tmp/trivia-tts-spike/index.html`, scorecard archived at
`~/.gstack/projects/roshanpaiva-trivia-for-all/spikes/day-0-tts-spike-results-*.md`)
exercised: AudioContext + `speechSynthesis` unlock pattern, voice list loading,
short questions, the "Five in a row!" streak announcement, longer fact sentences,
numeric speech (clock + score), and a 15-second background/screen-lock test.

### Result

| Device | Audio plays | Voices loaded | Voice quality | Background survives | Resume on return |
|---|---|---|---|---|---|
| iPhone Safari | ✅ | ✅ | acceptable | ✅ | ✅ |
| Android Chrome | ✅ | ✅ | acceptable | ✅ | ✅ |
| Mac Safari | ✅ | ✅ | acceptable | ✅ | ✅ |
| Mac Chrome | ✅ | ✅ | acceptable | ✅ | ✅ |

Both gating devices (iPhone Safari, Android Chrome) cleared the failure threshold
defined in the design doc, so the project ships with browser TTS for v1. Saves
the half-to-one weekend that server-cached MP3 infrastructure would have cost.

### Implementation rules

- **Always use the Audio Unlock Pattern from DESIGN.md → Audio Unlock Pattern.**
  iOS Safari requires the first `speechSynthesis.speak()` call to occur
  synchronously inside a user gesture. The "Start" button tap is the unlock event.
  Without it, audio is silently dropped. Test the unlock on a real iPhone before
  shipping any audio change.
- **Voice list is async on first call.** Listen for the `voiceschanged` event
  and re-render the voice picker; don't read `getVoices()` once at module load.
- **Pause + resume on `visibilitychange`.** The spike showed audio survives a
  short background, but to be safe: when the tab hides, call
  `speechSynthesis.pause()` and pause the game timer; when it returns, call
  `speechSynthesis.resume()` and resume the timer. Don't rely on the browser
  doing the right thing automatically.
- **Cancel on barge-in.** When the player taps an answer mid-read, call
  `speechSynthesis.cancel()` before any state transition. Without this, the
  next question's read-aloud will queue behind the canceled one.

### Caveats / known limitations

- **Voice quality is "acceptable" not "premium" everywhere.** If user feedback
  in v1 says the audio sounds robotic, the fallback path (server-cached MP3s
  via OpenAI TTS / Google Cloud TTS / ElevenLabs) is still documented in
  the design doc and can be added in v2 without architectural rework.
- **The 15-second lock-screen test passed on iPhone Safari, but the 30-second
  / 5-minute lock-screen behavior is untested.** Road-trip use cases (v2 with
  party mode) will need the Web Wake Lock API to prevent the screen from
  locking mid-game. Without it, long phone-down sessions may still die.
  Wake Lock support on iOS Safari is patchy — re-test when v2 ships.
- **Voice selection defaults are device-dependent.** Don't hard-code a voice
  name in code. Pick from `getVoices().filter(v => v.lang.startsWith('en'))`
  with the device's default as the fallback. Document the per-device default
  in the spike scorecard if the user reports voice complaints.

### When to revisit

- v1 user feedback indicates audio quality is the dominant complaint
- v2 ships party mode + voice answering (wake-lock work happens then anyway)
- Browser support changes (e.g., iOS deprecates speechSynthesis — extremely unlikely)
- A new device class enters the audience (smart TVs, in-car browsers, etc.)

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
