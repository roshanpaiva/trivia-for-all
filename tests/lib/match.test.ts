import { describe, it, expect } from "vitest";
import { matchAnswer, levenshtein, prepForMatch } from "@/lib/match";

const choices = (a: string, b: string, c: string, d: string) => [a, b, c, d] as const;

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });
  it("counts insertions", () => {
    expect(levenshtein("cat", "cats")).toBe(1);
  });
  it("counts deletions", () => {
    expect(levenshtein("cats", "cat")).toBe(1);
  });
  it("counts substitutions", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
  });
  it("handles empty strings", () => {
    expect(levenshtein("", "")).toBe(0);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });
  it("classic example: kitten -> sitting (3)", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

describe("prepForMatch — pre-processing pipeline", () => {
  it("lowercases and strips punctuation", () => {
    expect(prepForMatch("The Eiffel Tower!")).toBe("eiffel tower");
  });
  it("collapses whitespace", () => {
    expect(prepForMatch("hello   world")).toBe("hello world");
  });
  it("converts numerals to digits: simple ones", () => {
    expect(prepForMatch("twelve")).toBe("12");
    expect(prepForMatch("seven")).toBe("7");
    expect(prepForMatch("nineteen")).toBe("19");
  });
  it("converts compound numerals: tens + ones", () => {
    expect(prepForMatch("twenty five")).toBe("25");
    expect(prepForMatch("ninety nine")).toBe("99");
    // Hyphenated: punctuation stripped first, then "twenty" + "five"
    expect(prepForMatch("twenty-five")).toBe("25");
  });
  it("converts years: nineteen XX", () => {
    expect(prepForMatch("nineteen eighty four")).toBe("1984");
    expect(prepForMatch("nineteen forty five")).toBe("1945");
    expect(prepForMatch("nineteen ninety nine")).toBe("1999");
  });
  it("converts years: twenty twenty X", () => {
    expect(prepForMatch("twenty twenty four")).toBe("2024");
    expect(prepForMatch("twenty twenty")).toBe("2020");
  });
  it("strips articles", () => {
    expect(prepForMatch("the moon")).toBe("moon");
    expect(prepForMatch("a tree")).toBe("tree");
    expect(prepForMatch("an apple")).toBe("apple");
  });
});

describe("matchAnswer — TIER 1 exact match", () => {
  it("matches an exact answer (case-insensitive, post-normalize)", () => {
    const c = choices("Apple", "Banana", "Cherry", "Date");
    expect(matchAnswer("apple", c, 2)).toBe(0);
    expect(matchAnswer("APPLE", c, 2)).toBe(0);
    expect(matchAnswer("Apple", c, 2)).toBe(0);
  });
  it("matches with punctuation removed", () => {
    const c = choices("It's a snake", "It's a fish", "It's a bird", "It's a bug");
    expect(matchAnswer("its a snake!", c, 2)).toBe(0);
  });
  it("matches with article stripping", () => {
    const c = choices("The Eiffel Tower", "Big Ben", "Statue of Liberty", "Pyramids");
    expect(matchAnswer("Eiffel Tower", c, 2)).toBe(0);
    expect(matchAnswer("the eiffel tower", c, 2)).toBe(0);
  });
});

describe("matchAnswer — TIER 2 substring + numerals", () => {
  it("matches when heard is a substring of the choice", () => {
    const c = choices("12 stars", "13 stars", "14 stars", "15 stars");
    // "twelve" → "12" → substring of "12 stars"
    expect(matchAnswer("twelve", c, 2)).toBe(0);
  });
  it("matches when choice is a substring of heard", () => {
    const c = choices("Mars", "Venus", "Jupiter", "Saturn");
    // User says more than the choice — extra words don't break it
    expect(matchAnswer("the planet mars", c, 2)).toBe(0);
  });
  it("years: 'nineteen eighty four' matches '1984'", () => {
    const c = choices("1984", "1985", "1986", "1987");
    expect(matchAnswer("nineteen eighty four", c, 2)).toBe(0);
  });
  it("years: works the other way too — choice has the year word, heard is digits", () => {
    const c = choices("Nineteen Eighty Four", "1985", "1986", "1987");
    // Both prep to "1984"
    expect(matchAnswer("1984", c, 2)).toBe(0);
  });
});

describe("matchAnswer — TIER 3 fuzzy (Levenshtein)", () => {
  it("solo strictness=2 accepts 1-char typos", () => {
    const c = choices("Catalan", "Catatonia", "Castile", "Catalonia");
    // "katalan" off by 1 from "catalan" (k→c). Solo allows it.
    expect(matchAnswer("katalan", c, 2)).toBe(0);
  });
  it("party strictness=1 still accepts 1-char typos when unambiguous", () => {
    const c = choices("Apple", "Banana", "Cherry", "Date");
    // "appel" off by 1 (transposition treated as 2 inserts/deletes; let's pick a simpler typo)
    expect(matchAnswer("aple", c, 1)).toBe(0); // missing one letter, distance 1
  });
  it("party strictness=1 rejects ambiguous matches (two choices tied within 1)", () => {
    // The Catalan / Catatonia premise from the design doc: party-mode false
    // positives lose group trust faster than false negatives. Concrete case:
    // heard="appls" — two choices ("Apple", "Apply") are both Lev distance 1
    // from "appls". Best=1, secondBest=1, gap=0. Party rejects (refuses to
    // guess); solo picks the first.
    const c = choices("Apple", "Apply", "Cherry", "Date");
    expect(matchAnswer("appls", c, 1)).toBeNull(); // party — refuse
    expect(matchAnswer("appls", c, 2)).toBe(0); // solo — pick first (Apple)
  });
  it("solo strictness=2 accepts when distance is 2", () => {
    const c = choices("Catalan", "Catatonia", "Castile", "Catalonia");
    // "catelin" → catalan=2 (e→a, i→a)
    expect(matchAnswer("catelin", c, 2)).toBe(0);
  });
  it("rejects when no choice is within strictness", () => {
    const c = choices("Apple", "Banana", "Cherry", "Date");
    // "elephant" is far from everything
    expect(matchAnswer("elephant", c, 2)).toBeNull();
    expect(matchAnswer("elephant", c, 1)).toBeNull();
  });
});

describe("matchAnswer — multi-word choices + tokens", () => {
  it("matches when each heard token finds a close-enough choice token", () => {
    const c = choices("New York", "Los Angeles", "Chicago", "Houston");
    expect(matchAnswer("New York", c, 1)).toBe(0);
    // STT might mishear: "New Yorck" → "york" off by 1 from "york"
    expect(matchAnswer("new yorck", c, 1)).toBe(0);
  });
  it("rejects when one heard token is too far from every choice token", () => {
    const c = choices("New York", "Los Angeles", "Chicago", "Houston");
    // "new poughkeepsie" → "poughkeepsie" doesn't match any token in any choice
    expect(matchAnswer("new poughkeepsie", c, 2)).toBeNull();
  });
});

describe("matchAnswer — empty / edge cases", () => {
  it("returns null for empty heard", () => {
    const c = choices("a", "b", "c", "d");
    expect(matchAnswer("", c, 2)).toBeNull();
    expect(matchAnswer("   ", c, 2)).toBeNull();
  });
  it("returns null for noise-only heard", () => {
    const c = choices("Apple", "Banana", "Cherry", "Date");
    expect(matchAnswer("uhh um", c, 2)).toBeNull();
  });
});

describe("matchAnswer — production-likely scenarios", () => {
  it("user says full phrase; choice is one word", () => {
    const c = choices("Mars", "Venus", "Jupiter", "Saturn");
    expect(matchAnswer("the answer is mars", c, 1)).toBe(0);
  });
  it("STT adds a leading filler", () => {
    const c = choices("Australia", "New Zealand", "Fiji", "Indonesia");
    expect(matchAnswer("uh australia", c, 2)).toBe(0);
  });
  it("user says the year as a single number", () => {
    const c = choices("1969", "1970", "1971", "1972");
    expect(matchAnswer("nineteen sixty nine", c, 1)).toBe(0);
  });
  it("user says 'a hundred' but choice is 100 — known v1 limitation, returns null", () => {
    // Documented gap: "a hundred" / "one hundred" not in the numeral map yet.
    // Trivia bank is mostly small numbers + years; revisit if real users hit this.
    const c = choices("100", "200", "300", "400");
    expect(matchAnswer("one hundred", c, 2)).toBeNull();
  });
});
