/**
 * Shared types for Trivia for All.
 *
 * The split between Question and ClientQuestion enforces the server-authoritative
 * answer rule from the design doc: correctIdx never leaves the server. The client
 * POSTs a chosen choiceIdx; the server validates and returns correctness + the
 * fact text.
 */

export type Category =
  | "general"
  | "geography"
  | "science"
  | "history"
  | "random"
  | "sports";

export type Difficulty = "easy" | "medium" | "hard";

export type AttemptMode = "scored" | "practice";

/** The server-side question record. Contains correctIdx — never sent to the client. */
export type Question = {
  id: string;
  category: Category;
  difficulty: Difficulty;
  prompt: string;
  choices: [string, string, string, string];
  correctIdx: 0 | 1 | 2 | 3;
  fact: string;
  source?: string;
};

/** The client-safe payload. correctIdx and fact are stripped server-side until reveal. */
export type ClientQuestion = Omit<Question, "correctIdx" | "fact">;

/** A persisted score row used for leaderboard ranking. */
export type ScoreRow = {
  scoreId: number; // auto-increment from the scores table
  cookieId: string;
  dateUtc: string; // YYYY-MM-DD
  correctCount: number;
  wrongCount: number;
  finishedAt: Date | string;
};
