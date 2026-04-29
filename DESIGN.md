# Design System — Quizzle

> **Memorable thing:** "Learning when it doesn't feel like learning."
> Every decision below serves this. If a future change makes the product feel more like classroom or more like SaaS, it's the wrong change.

## Product Context

- **What this is:** A 90-second sprint trivia game. Phone-native. Up to 5 scored attempts per day, each draws 20 random questions, leaderboard ranks best score today. Audio-first (TTS reads questions aloud). Practice mode is unlimited and unscored.
- **Who it's for:** Mixed-age families playing together — kids 9+ and adults at the same kitchen counter, dinner table, or back seat. v1 is the kitchen-counter use case; v2 adds party mode + voice answering for road trips.
- **Space/industry:** Casual mobile games + edutainment + daily-puzzle adjacent. NYT Connections, Wordle, Sporcle, Kahoot, Alexa Quick Fire Quiz are the reference set.
- **Project type:** Web app, mobile-first, single-page. Next.js (App Router) + TypeScript + Tailwind, deployed on Vercel. Centered ~400px column on tablet/desktop with warm-cream surround (D10).

## Aesthetic Direction

- **Direction:** Editorial-arcade. Type-led with playful confidence. Game-first, never classroom-coded. Closer to NYT Games than Kahoot, but with more swagger than NYT — a Sunday morning ritual product, not a Monday morning study product.
- **Decoration level:** Minimal as baseline; the audio waveform is the only ambient texture. No decorative blobs, no gradients, no icons in colored circles. The audio waveform IS the brand visual — used in the header and animated when audio is actively playing.
- **Mood:** Warm, confident, smart, family-friendly without being kid-coded. Reads as craft, not toy.
- **Reference points:** NYT Games (Connections, Wordle) for restraint and type-led brand; Alexa Quick Fire Quiz for the audio-first identity premise (which we visualize via the waveform mark).
- **Anti-references:** Kahoot (purple gradients, classroom-coded, SaaS-template feel), Sporcle (dense card grid, image-thumbnail BBS), Quizlet/Khan Academy (any "education product" signal).

## Typography

- **Display/Hero:** **Cabinet Grotesk** (Indian Type Foundry, free via Fontshare). Geometric grotesk with subtle quirks; four display weights (400, 500, 700, 800). Used for the brand mark, hero headline, post-game score, "Five in a row" streak reveal. Weight 800 for moments; weight 700 for support. Letter-spacing -0.02em to -0.025em on display sizes.
- **Body + UI + Tabular:** **Geist Sans** (Vercel, free via Google Fonts). Used for everything else — questions, choices, CTAs, status text. With `font-feature-settings: "tnum"` for clocks, scores, leaderboard ranks (digits don't shift width).
- **Loading:**
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://api.fontshare.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,700,800&display=swap" rel="stylesheet">
  ```
- **Italic policy:** Cabinet Grotesk has limited italic support. We do **not** use italic emphasis. For accent emphasis, use the burnt-orange accent color on the emphasized word (color-only emphasis, no italic).

### Type Scale

| Token | Size | Weight | Family | Usage |
|---|---|---|---|---|
| `--display-xl` | 64px | 800 | Cabinet Grotesk | Post-game score, "Five in a row" reveal |
| `--display-l` | 36px | 800 | Cabinet Grotesk | Hero headline, brand mark (large variant) |
| `--display-m` | 28px | 700-800 | Cabinet Grotesk | Section headlines, in-game question prompt |
| `--body-l` | 22px | 600 | Geist Sans | Choice buttons, primary CTAs |
| `--body` | 18px | 500 | Geist Sans | Questions, paragraphs, default body |
| `--small` | 14px | 500 | Geist Sans | Status text, secondary metadata |
| `--micro` | 12px | 600 | Geist Sans | UPPERCASE labels, letter-spacing 0.12em |

Body min size of 18px is non-negotiable (kid-readability for ages 9+).

## Color

- **Approach:** Restrained. One accent color, warm neutrals, semantic for success/error only.

### Light Mode (Canvas)

| Token | Hex | Usage |
|---|---|---|
| `--ink` | `#1A1A1A` | Primary text, primary stroke. Slightly off-black, not pure. |
| `--canvas` | `#FAF7F2` | Page background. Warm cream, never pure white. Sunday-morning feel. |
| `--surface` | `#F2EDE5` | Cards, wells, raised surfaces. Slightly darker cream. |
| `--line` | `#D4CCBE` | Dividers, default borders. Warm light gray. |
| `--muted` | `#8A8378` | Secondary text, status pills. Warm mid-gray. |
| `--accent` | `#D4622A` | **The brand color.** Burnt orange / terracotta. |
| `--accent-soft` | `rgba(212,98,42,0.12)` | Accent with low opacity for backgrounds (e.g., active pill background). |
| `--accent-strong` | `#B85525` | Accent for text on light backgrounds when contrast needs to be higher. |
| `--success` | `#3A7D44` | Correct answer indicator, "new best!" callouts. |
| `--error` | `#A33B2A` | Wrong answer indicator, error states. |

### Dark Mode (v2)

| Token | Hex | Usage |
|---|---|---|
| `--ink` | `#F2EDE5` | Primary text. |
| `--canvas` | `#1F1B16` | Page background. Deep warm gray, not pure black. |
| `--surface` | `#2A251F` | Cards, raised surfaces. |
| `--line` | `#3D3730` | Dividers. |
| `--muted` | `#9A9388` | Secondary text. |
| `--accent` | `#B85525` | Brand color (desaturated ~15% for dark mode). |

Dark mode is **deferred to v2** but the token swap strategy is documented so future implementation knows where to land.

### Accent Usage Rules

The accent (`#D4622A`) appears **only in active moments**:
- Streak progress dots that have been filled
- The `+10s` / `+15s` flying number on bonus reveal
- Post-game "new best!" callout
- Audio waveform mark when sound is actively playing
- Active pill backgrounds (`--accent-soft`)

The accent does **not** appear as:
- Flat backgrounds
- Solid CTA fills (use `--ink` for primary CTAs)
- Body text color (only for short emphasis words)
- Gradient stops (no gradients in this system)

## Spacing

- **Base unit:** 4px
- **Density:** Comfortable (between compact and spacious — fits iPhone SE without scrolling, breathes enough for kids)
- **Scale:** `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`
- **Default card/section padding:** 24px
- **Default vertical rhythm between sections:** 16px or 24px
- **Touch targets:** Always 56px+ minimum (44px is the WCAG floor; we target 56px for kid-finger margin)

## Layout

- **Approach:** Mobile-first single column, 375-420px max width.
- **Desktop/tablet:** Center the mobile column with a soft `--canvas` surround. No reflow. The product is phone-first; desktop just renders the phone view honestly. (Decision D10 from `/plan-design-review`.)
- **Grid:** Single column on mobile. Asymmetric within constraints — Q-counter top-left, audio status top-right, clock dominant center, choices full-width.
- **Max content width:** 420px (the phone column). Page max-width on desktop: 1200px (for things like the design preview page itself, not the game UI).
- **Border radius:**
  | Token | Value | Usage |
  |---|---|---|
  | `--r-sm` | 4px | Small chrome, status pills inner |
  | `--r-md` | 8px | Buttons, cards, choice tiles |
  | `--r-lg` | 12px | Larger cards, modals |
  | `--r-pill` | 9999px | Status pills, attempt counter |
- **No bubbly oversized radii.** Avoid 16px+ on standard components.

## Motion

- **Approach:** Minimal-functional baseline + 3 expressive moments only.
- **Easing:** enter `ease-out`, exit `ease-in`, move `ease-in-out`
- **Duration tokens:** micro `100ms`, short `200ms`, medium `350ms`, long `600ms`
- **Three expressive moments (the only intentional animations in v1):**
  1. **Streak dot fill** (D4): each correct fills the next dot with a `200ms ease-out` accent color sweep.
  2. **Bonus reveal** (D11): clock pulses 1.05x → 1.0x over `400ms`; +10s number rises 24px and fades over `600ms`.
  3. **Streak break flash** (D14): all dots gray-flash for `200ms` then empty.
- **Reduced motion:** All animation respects `@media (prefers-reduced-motion: reduce)` (instant state changes, no pulse, no rise).

## Brand Voice

- **Confident, never apologetic.** "Today's daily." not "Welcome to today's daily!"
- **Direct, never instructional.** "Tap to answer" only when needed; usually let the UI speak.
- **Warm, never patronizing.** Never use kid-coded copy ("Good job, sport!"). Never use enterprise-coded copy ("Your data is being processed").
- **Family-friendly without being kid-only.** A 12-year-old and a 50-year-old both read it as written for them.
- **Headline copy patterns:** "90 seconds. As many as you can get." "5 attempts left today." "Best today: 17."
- **Avoid:** "Welcome to...", "Get ready to learn!", "Quiz time!", "Awesome!", em dashes used as decorative beats, exclamation marks except in earned moments.
- **Lean into:** short sentences, period-ended fragments, present tense, calm declaratives.

## Iconography

- **Primary brand mark:** The audio waveform (5 vertical bars, varying heights, 2-3px wide each, gap 2px). When audio is inactive, bars are `--ink`. When audio is playing, bars are `--accent` and animate (subtle scaleY pulse, respects reduced-motion).
- **No other iconography at v1.** No category icons, no decorative SVGs, no emoji as design elements (Wordle-style emoji squares in the share block are content, not chrome — those are fine).

## Accessibility Baseline (D11)

- **Touch targets:** 56px minimum (44px floor + kid-finger margin)
- **Color contrast:** 4.5:1 minimum on body text and CTAs (current palette passes; verify any new combinations)
- **Focus rings:** Visible on all interactive elements (`:focus-visible` with 2px ring in `--ink` or `--accent`)
- **Screen reader:** Streak announcements and reveal messages go through `aria-live="polite"` so deaf users still get the moment
- **Reduced motion:** Disables clock pulse, +10s rise, streak fill animation; replaces with instant state changes
- **Keyboard nav:** Number keys `1`-`4` map to the 4 choices; spacebar = start/advance; Enter on focused button works as expected

## CSS Custom Properties (Implementation Snippet)

```css
:root {
  /* Color — light mode */
  --ink: #1a1a1a;
  --canvas: #faf7f2;
  --surface: #f2ede5;
  --line: #d4ccbe;
  --muted: #8a8378;
  --accent: #d4622a;
  --accent-soft: rgba(212, 98, 42, 0.12);
  --accent-strong: #b85525;
  --success: #3a7d44;
  --error: #a33b2a;

  /* Type */
  --display-xl: 64px;
  --display-l: 36px;
  --display-m: 28px;
  --body-l: 22px;
  --body: 18px;
  --small: 14px;
  --micro: 12px;

  /* Spacing */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px;

  /* Radii */
  --r-sm: 4px;
  --r-md: 8px;
  --r-lg: 12px;
  --r-pill: 9999px;
}

[data-theme="dark"] {
  --ink: #f2ede5;
  --canvas: #1f1b16;
  --surface: #2a251f;
  --line: #3d3730;
  --muted: #9a9388;
  --accent: #b85525;
  --accent-soft: rgba(184, 85, 37, 0.18);
  --accent-strong: #d4622a;
  --success: #6fa478;
  --error: #c8624f;
}

body {
  font-family: 'Geist', system-ui, -apple-system, sans-serif;
  font-size: var(--body);
  font-weight: 500;
  line-height: 1.5;
  color: var(--ink);
  background: var(--canvas);
}

.display, h1, h2, h3, .brand {
  font-family: 'Cabinet Grotesk', sans-serif;
  letter-spacing: -0.02em;
}

.tabular {
  font-feature-settings: "tnum";
}
```

For Tailwind: extend the config with these tokens or use plain CSS variables alongside Tailwind utilities. Tokens must be the source of truth, not Tailwind's defaults.

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-27 | Initial design system created via `/design-consultation` | Anchored to memorable thing: "Learning when it doesn't feel like learning." Editorial-arcade aesthetic, warm cream + burnt orange accent, audio waveform as brand mark. |
| 2026-04-27 | Display typeface: Cabinet Grotesk (replacing initial Fraunces proposal) | Fraunces serif felt too literary/editorial for a game. Cabinet Grotesk geometric grotesk reads game-energy + modern + family-friendly without being childish. |
| 2026-04-27 | Italic accent treatment dropped | Cabinet Grotesk doesn't have a true italic. Color-only emphasis (accent on key words) replaces italic across the system. |

## Adjacent Documents

- **Approved wireframes** (layout reference, monochrome): `~/.gstack/projects/roshanpaiva-trivia-for-all/designs/wireframes-20260427/wireframes.html`
- **Design system preview** (this system rendered live): `/tmp/design-consultation-preview-1777356664.html` (regenerate via `/design-consultation`)
- **Product design doc** (v1 spec, mechanics, API): `~/.gstack/projects/roshanpaiva-trivia-for-all/roshanpaiva-roshanpaiva-trivia-brainstorm-design-20260427-171936.md`
