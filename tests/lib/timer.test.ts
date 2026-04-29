import { describe, it, expect } from "vitest";
import {
  gameReducer,
  initialGameState,
  remainingSoftCap,
  PER_QUESTION_SOFT_CAP_MS,
  type GameState,
  type GameEvent,
} from "@/lib/timer";

const TOTAL = 20;
const reduce = (s: GameState, e: GameEvent) => gameReducer(s, e, TOTAL);

describe("gameReducer — phase transitions", () => {
  it("idle → start → reading", () => {
    const s = reduce(initialGameState(), { type: "start" });
    expect(s.phase).toBe("reading");
    expect(s.questionIdx).toBe(0);
  });

  it("start is a no-op if not idle", () => {
    let s = initialGameState();
    s = reduce(s, { type: "start" });
    s = reduce(s, { type: "start" }); // second start ignored
    expect(s.phase).toBe("reading");
  });

  it("reading → reading-complete → answering (clock starts ticking)", () => {
    let s = reduce(initialGameState(), { type: "start" });
    const t0 = 1000;
    s = reduce(s, { type: "reading-complete", nowMs: t0 });
    expect(s.phase).toBe("answering");
    expect(s.answeringStartedAt).toBe(t0);
  });

  it("answering tick decrements clockMs", () => {
    let s = reduce(initialGameState(), { type: "start" });
    s = reduce(s, { type: "reading-complete", nowMs: 0 });
    const before = s.score.clockMs;
    s = reduce(s, { type: "tick", deltaMs: 100 });
    expect(s.score.clockMs).toBe(before - 100);
  });

  it("tick during reading does NOT decrement clock", () => {
    let s = reduce(initialGameState(), { type: "start" });
    const before = s.score.clockMs;
    s = reduce(s, { type: "tick", deltaMs: 1000 });
    expect(s.score.clockMs).toBe(before); // unchanged
  });

  it("answering → tap-answer → validating", () => {
    let s = reduce(initialGameState(), { type: "start" });
    s = reduce(s, { type: "reading-complete", nowMs: 0 });
    s = reduce(s, { type: "tap-answer", choiceIdx: 1, nowMs: 500 });
    expect(s.phase).toBe("validating");
    expect(s.answeringStartedAt).toBeNull();
  });

  it("reading → tap-answer (barge-in) → validating skips answering", () => {
    let s = reduce(initialGameState(), { type: "start" });
    s = reduce(s, { type: "tap-answer", choiceIdx: 1, nowMs: 100 });
    expect(s.phase).toBe("validating");
  });

  it("validation-result correct → reveal + score updates", () => {
    let s = reduce(initialGameState(), { type: "start" });
    s = reduce(s, { type: "reading-complete", nowMs: 0 });
    s = reduce(s, { type: "tap-answer", choiceIdx: 1, nowMs: 500 });
    s = reduce(s, { type: "validation-result", correct: true, correctIdx: 1, fact: "f" });
    expect(s.phase).toBe("reveal");
    expect(s.score.correctCount).toBe(1);
    expect(s.score.streak).toBe(1);
    expect(s.reveal?.correct).toBe(true);
    expect(s.reveal?.streakAnnouncement).toBeNull();
  });

  it("validation-result wrong → reveal + streak reset", () => {
    let s = reduce(initialGameState(), { type: "start" });
    // Build up a 3-streak
    for (let i = 0; i < 3; i++) {
      s = reduce(s, { type: "reading-complete", nowMs: 0 });
      s = reduce(s, { type: "tap-answer", choiceIdx: 0, nowMs: 0 });
      s = reduce(s, { type: "validation-result", correct: true, correctIdx: 0, fact: "" });
      s = reduce(s, { type: "reveal-complete" });
    }
    expect(s.score.streak).toBe(3);

    s = reduce(s, { type: "reading-complete", nowMs: 0 });
    s = reduce(s, { type: "tap-answer", choiceIdx: 1, nowMs: 0 });
    s = reduce(s, { type: "validation-result", correct: false, correctIdx: 0, fact: "f" });
    expect(s.phase).toBe("reveal");
    expect(s.score.streak).toBe(0);
    expect(s.score.wrongCount).toBe(1);
  });

  it("validation-result at streak 4→5 fires streak-5 announcement", () => {
    let s = reduce(initialGameState(), { type: "start" });
    for (let i = 0; i < 4; i++) {
      s = reduce(s, { type: "reading-complete", nowMs: 0 });
      s = reduce(s, { type: "tap-answer", choiceIdx: 0, nowMs: 0 });
      s = reduce(s, { type: "validation-result", correct: true, correctIdx: 0, fact: "" });
      s = reduce(s, { type: "reveal-complete" });
    }
    s = reduce(s, { type: "reading-complete", nowMs: 0 });
    s = reduce(s, { type: "tap-answer", choiceIdx: 0, nowMs: 0 });
    s = reduce(s, { type: "validation-result", correct: true, correctIdx: 0, fact: "ignored" });
    expect(s.reveal?.streakAnnouncement).toBe("streak-5");
  });

  it("reveal → reveal-complete → next question (reading)", () => {
    let s = reduce(initialGameState(), { type: "start" });
    s = reduce(s, { type: "reading-complete", nowMs: 0 });
    s = reduce(s, { type: "tap-answer", choiceIdx: 0, nowMs: 0 });
    s = reduce(s, { type: "validation-result", correct: true, correctIdx: 0, fact: "f" });
    s = reduce(s, { type: "reveal-complete" });
    expect(s.phase).toBe("reading");
    expect(s.questionIdx).toBe(1);
  });

  it("answering → tick that drains clock to 0 → finished (time-out)", () => {
    let s = reduce(initialGameState(), { type: "start" });
    s = reduce(s, { type: "reading-complete", nowMs: 0 });
    s = reduce(s, { type: "tick", deltaMs: 200_000 }); // way more than 90s
    expect(s.phase).toBe("finished");
    expect(s.endReason).toBe("time-out");
  });

  it("soft-cap-elapsed during answering → reveal as wrong", () => {
    let s = reduce(initialGameState(), { type: "start" });
    s = reduce(s, { type: "reading-complete", nowMs: 0 });
    s = reduce(s, { type: "soft-cap-elapsed" });
    expect(s.phase).toBe("reveal");
    expect(s.score.wrongCount).toBe(1);
    expect(s.reveal?.correct).toBe(false);
    expect(s.reveal?.correctIdx).toBe(-1); // unknown — soft cap, no server validation
  });

  it("reveal-complete past totalQuestions → finished (max-questions)", () => {
    // Synthesize state at the last question revealed
    const s: GameState = {
      ...initialGameState(),
      phase: "reveal",
      questionIdx: TOTAL - 1,
      reveal: { correct: true, correctIdx: 0, fact: "", streakAnnouncement: null },
    };
    const next = reduce(s, { type: "reveal-complete" });
    expect(next.phase).toBe("finished");
    expect(next.endReason).toBe("max-questions");
  });

  it("ignores unrelated events in wrong phase", () => {
    const s = initialGameState();
    const after = reduce(s, { type: "reveal-complete" }); // not in reveal phase
    expect(after).toEqual(s); // unchanged
  });
});

describe("remainingSoftCap", () => {
  it("returns 0 when not in answering phase", () => {
    const s = initialGameState();
    expect(remainingSoftCap(s, 1000)).toBe(0);
  });

  it("returns full cap immediately after entering answering", () => {
    const s: GameState = {
      ...initialGameState(),
      phase: "answering",
      answeringStartedAt: 1000,
    };
    expect(remainingSoftCap(s, 1000)).toBe(PER_QUESTION_SOFT_CAP_MS);
  });

  it("returns 0 when cap exceeded", () => {
    const s: GameState = {
      ...initialGameState(),
      phase: "answering",
      answeringStartedAt: 1000,
    };
    expect(remainingSoftCap(s, 1000 + PER_QUESTION_SOFT_CAP_MS + 500)).toBe(0);
  });
});
