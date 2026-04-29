# Content License — Question Bank

## Source

The trivia question bank that ships with Quizzle is derived from the [**Open Trivia Database**](https://opentdb.com/) (OTDB), a community-curated free trivia API.

Each row in `src/data/questions.json` whose `source` field is `"opentdb"` originated as an OTDB question. We then **hand-audited** each one for tone, accuracy, and kid-friendliness, and **wrote the `fact` text ourselves** (the one-sentence explanatory blurb read aloud after each answer). Hand-written entries (added directly without an OTDB origin) have an empty or absent `source` field.

## License — CC BY-SA 4.0

OTDB content is published under the [**Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0)**](https://creativecommons.org/licenses/by-sa/4.0/).

Per that license, you are free to:

- **Share** — copy and redistribute the material in any medium or format
- **Adapt** — remix, transform, and build upon the material for any purpose, even commercially

Under the following terms:

- **Attribution** — You must give appropriate credit, provide a link to the license, and indicate if changes were made.
- **ShareAlike** — If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original.

## Attribution

Quizzle credits OTDB in the page footer of every public screen and links to the CC BY-SA 4.0 license. The attribution text reads:

> Questions from [Open Trivia DB](https://opentdb.com/) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

## ShareAlike notice

Because the question bank derives from CC BY-SA 4.0 content, **the question bank itself (`src/data/questions.json`) is also licensed under CC BY-SA 4.0**. If you fork Quizzle and modify the bank, your modifications to the bank inherit CC BY-SA 4.0.

The application code in this repository (everything outside `src/data/questions.json` and `src/data/questions-raw.json`) is licensed under the repository's primary license (currently unset — defaults to "all rights reserved" until a code license is added).

## Re-fetching from OTDB

`scripts/fetch-questions.py` re-fetches a fresh batch of OTDB candidates into `src/data/questions-raw.json`. The audit step (`scripts/audit-questions.py`) is what promotes a candidate into the shipped bank, where the editor is expected to apply the same standards (kid-appropriate, verifiable, surprising) and write a fact in their own words.
