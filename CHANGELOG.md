# Changelog

All notable changes to Trivia for All are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning is MAJOR.MINOR.PATCH.MICRO.

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
