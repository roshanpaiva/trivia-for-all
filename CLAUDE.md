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
