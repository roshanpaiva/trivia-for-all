# Changelog

All notable changes to Trivia for All are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning is MAJOR.MINOR.PATCH.MICRO.

## [0.1.0.1] - 2026-04-28

### Added
- `CLAUDE.md` — `## TTS Strategy` section. v1 ships browser-native `speechSynthesis` after Day 0 device spike confirmed both gating devices (iPhone Safari + Android Chrome) cleared the failure threshold. Saves the half-to-one weekend that server-cached MP3 infrastructure would have cost. Caveats and v2 wake-lock revisit conditions documented.

### Notes
- Spike artifact (test page + filled scorecard) archived at `~/.gstack/projects/roshanpaiva-trivia-for-all/spikes/`.

## [0.1.0.0] - 2026-04-27

### Added
- `DESIGN.md` — design system source of truth: editorial-arcade aesthetic, Cabinet Grotesk + Geist typography, warm cream + burnt orange palette, audio waveform brand mark, motion + a11y baseline, full token spec.
- `CLAUDE.md` — `## Design System` section telling future skill sessions to read `DESIGN.md` before any visual decision.
- `.gitignore` — macOS, Node/Next.js, gstack workspace artifacts.
- `VERSION` and this `CHANGELOG.md` — bump pipeline ready for future ships.

### Notes
- Greenfield project. Next.js scaffolding, test framework, and implementation come in subsequent PRs.
- Planning artifacts (design doc, wireframes HTML, design preview HTML) live in `~/.gstack/projects/roshanpaiva-trivia-for-all/` and are not part of the repo.
