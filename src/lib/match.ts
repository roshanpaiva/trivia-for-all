/**
 * Answer matching for voice answering (party mode).
 *
 * The user shouts their answer. webkitSpeechRecognition transcribes it as a
 * string ("twelve stars", "the eiffel tower", "nineteen eighty four"). We need
 * to figure out which of the four choices they meant — accepting some sloppiness
 * (numerals as words, missing articles, plural/singular drift) without false
 * positives that lose group trust ("Catalan" should not match "Catatonia").
 *
 * Per eng D7 + design DD7, the strictness is mode-dependent:
 *   - solo:  Lev 2 (forgiving — single player, false negatives are worse)
 *   - party: Lev 1 (strict  — group sees the score; false positives kill trust)
 *
 * Match tiers, in order:
 *   1. Normalize + exact equality
 *   2. Substring (heard ⊂ choice OR choice ⊂ heard) after numeral-word
 *      equivalence pass
 *   3. Token-level Levenshtein within `strictness` distance
 *
 * First tier that hits returns. Returns null if no choice matches.
 */

export type MatchStrictness = 1 | 2;

/** Normalize: lowercase, strip non-alphanum (keep digits + spaces), collapse runs.
 * Punctuation and articles become noise. "The Eiffel Tower!" → "the eiffel tower". */
const normalize = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // letters + numbers + space, drop everything else
    .replace(/\s+/g, " ")
    .trim();

// ===== Numeral-word equivalence =====
//
// STT often returns spelled-out numbers ("twelve") even when the choice has
// digits ("12 stars"), or vice versa for years. Normalize both sides to digits
// before substring/Levenshtein so the comparison is fair.

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Convert one or two consecutive number-words to a digit string.
 * "twelve"           → "12"
 * "twenty five"      → "25"   (also handles "twenty-five" via normalize step)
 * "nineteen"         → "19"
 * Returns null when the token isn't a number-word at all. */
const wordToNum2 = (a: string, b: string | undefined): { value: number; consumed: number } | null => {
  if (a in ONES) return { value: ONES[a], consumed: 1 };
  if (a in TENS) {
    if (b && b in ONES && ONES[b] < 10) return { value: TENS[a] + ONES[b], consumed: 2 };
    return { value: TENS[a], consumed: 1 };
  }
  return null;
};

/** "nineteen eighty four" → "1984". Only matches when leading word is a teen
 * (13-19) and the next group resolves to 0-99 — covers years 1300-1999 and
 * 2000s scoped patterns ("twenty twenty four" → 2024). */
const tryYear = (tokens: string[], i: number): { value: number; consumed: number } | null => {
  // Pattern A: "nineteen XX" — teens + (0-99)
  if (tokens[i] === "nineteen") {
    const tail = wordToNum2(tokens[i + 1] ?? "", tokens[i + 2]);
    if (tail && tail.value >= 0 && tail.value <= 99) {
      return { value: 1900 + tail.value, consumed: 1 + tail.consumed };
    }
    // Pattern A.1: "nineteen hundred" stays 1900, but it's rare; skip.
  }
  // Pattern B: "twenty XX" — but "twenty" is also a TENS so we need to
  // disambiguate. "twenty four" should stay 24, "twenty twenty four" → 2024.
  // The key: the FIRST "twenty" is the era prefix; the SECOND "twenty" starts
  // the suffix and may itself be the start of a "twenty NN" tens-ones pair.
  if (tokens[i] === "twenty" && tokens[i + 1] === "twenty") {
    const tail = wordToNum2(tokens[i + 1], tokens[i + 2]);
    if (tail) return { value: 2000 + tail.value, consumed: 1 + tail.consumed };
    return { value: 2020, consumed: 2 };
  }
  return null;
};

/** Replace runs of number-words with digit equivalents. Idempotent. */
const numeralize = (s: string): string => {
  const tokens = s.split(" ");
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const year = tryYear(tokens, i);
    if (year) {
      out.push(String(year.value));
      i += year.consumed;
      continue;
    }
    const n = wordToNum2(tokens[i], tokens[i + 1]);
    if (n) {
      out.push(String(n.value));
      i += n.consumed;
      continue;
    }
    out.push(tokens[i]);
    i += 1;
  }
  return out.join(" ");
};

/** Strip leading articles + filler that adds no information. */
const ARTICLES = new Set(["the", "a", "an"]);
const stripArticles = (s: string): string =>
  s.split(" ").filter((t) => !ARTICLES.has(t)).join(" ");

/** Standard Levenshtein distance — inserts, deletes, substitutions. */
export const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Two-row DP — O(min(a,b)) memory. Standard.
  let prev = Array(b.length + 1).fill(0).map((_, i) => i);
  let curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
};

/** Pre-process a string for matching: normalize, numeralize, strip articles. */
export const prepForMatch = (raw: string): string =>
  stripArticles(numeralize(normalize(raw)));

/**
 * Match a heard string against four choices.
 *
 * Returns the 0-3 index of the matched choice, or null if none matches.
 *
 * @param heard      The transcribed text from STT (e.g., "twelve stars").
 * @param choices    The four answer strings as displayed (e.g., ["12 stars", ...]).
 * @param strictness 1 (party — strict) or 2 (solo — forgiving). Per eng D7.
 */
export const matchAnswer = (
  heard: string,
  choices: readonly string[],
  strictness: MatchStrictness,
): number | null => {
  const heardPrep = prepForMatch(heard);
  if (!heardPrep) return null;

  const prepped = choices.map((c) => prepForMatch(c));

  // TIER 1: normalize + exact
  for (let i = 0; i < prepped.length; i++) {
    if (prepped[i] === heardPrep) return i;
  }

  // TIER 2: substring (either direction). "12" matches "12 stars". "the eiffel
  // tower" matches "eiffel tower" after article stripping.
  for (let i = 0; i < prepped.length; i++) {
    if (!prepped[i]) continue;
    if (prepped[i].includes(heardPrep) || heardPrep.includes(prepped[i])) return i;
  }

  // TIER 3: per-token Levenshtein within strictness. We match if ALL of the
  // heard tokens find a within-distance pair in the choice (so single-word
  // typos don't get rejected for being one token off across a long phrase).
  // Pick the choice with the smallest total distance to break ties — and only
  // accept if the WINNING choice is strictly better than runner-ups, to avoid
  // ambiguous matches.
  const heardTokens = heardPrep.split(" ").filter(Boolean);
  if (heardTokens.length === 0) return null;

  const scores = prepped.map((c) => {
    const choiceTokens = c.split(" ").filter(Boolean);
    if (choiceTokens.length === 0) return Infinity;
    let total = 0;
    for (const ht of heardTokens) {
      let best = Infinity;
      for (const ct of choiceTokens) {
        const d = levenshtein(ht, ct);
        if (d < best) best = d;
        if (best === 0) break;
      }
      // If any single heard token is too far from every choice token,
      // fail this whole candidate — strictness is per-token, not per-string.
      if (best > strictness) return Infinity;
      total += best;
    }
    return total;
  });

  let bestIdx = -1;
  let bestScore = Infinity;
  let secondBest = Infinity;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] < bestScore) {
      secondBest = bestScore;
      bestScore = scores[i];
      bestIdx = i;
    } else if (scores[i] < secondBest) {
      secondBest = scores[i];
    }
  }
  if (bestIdx === -1 || bestScore === Infinity) return null;

  // Strict mode (party): require unambiguous winner. If two choices tie or are
  // close, refuse — the group sees the score, false positives lose trust.
  if (strictness === 1 && secondBest - bestScore < 1) return null;

  return bestIdx;
};
