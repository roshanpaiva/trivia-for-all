import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  startAttempt,
  submitAnswer,
  finalizeAttempt,
  getLeaderboard,
  signupForNotify,
  submitAnswerWithRetry,
  ApiError,
} from "@/lib/api";

const mockFetch = (responses: Array<{ status: number; body: unknown }>) => {
  let i = 0;
  const impl = async (..._args: unknown[]): Promise<Response> => {
    void _args;
    const r = responses[i++] ?? responses[responses.length - 1];
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  const fetchMock = vi.fn(impl) as unknown as ReturnType<typeof vi.fn> & {
    mock: { calls: Array<[RequestInfo | URL, RequestInit | undefined]> };
  };
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("startAttempt", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("posts the mode and returns parsed JSON", async () => {
    const fetchMock = mockFetch([{
      status: 200,
      body: {
        attemptId: "att-1", mode: "scored", questionIds: ["q1"], questions: [],
        dateUtc: "2026-04-29", attemptsRemaining: 4,
      },
    }]);
    const res = await startAttempt("scored");
    expect(res.attemptId).toBe("att-1");
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("/api/attempt/start");
    expect((call[1] as RequestInit).method).toBe("POST");
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({ mode: "scored" });
  });

  it("throws ApiError on 429 with the daily_limit_reached code", async () => {
    mockFetch([{ status: 429, body: { error: "daily_limit_reached", resetAtUtc: "2026-04-30T00:00:00Z" } }]);
    await expect(startAttempt("scored")).rejects.toThrow(ApiError);
    try {
      await startAttempt("scored");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.code).toBe("daily_limit_reached");
      expect(err.status).toBe(429);
    }
  });

  it("throws ApiError with unknown_error if body has no error field", async () => {
    mockFetch([{ status: 500, body: {} }]);
    try {
      await startAttempt("scored");
    } catch (e) {
      expect((e as ApiError).code).toBe("unknown_error");
    }
  });
});

describe("submitAnswer", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("posts the answer payload + returns reveal", async () => {
    mockFetch([{
      status: 200,
      body: { correct: true, correctIdx: 1, fact: "Canberra etc.", isDuplicate: false },
    }]);
    const res = await submitAnswer({ attemptId: "a", questionId: "q", choiceIdx: 1 });
    expect(res.correct).toBe(true);
    expect(res.fact).toContain("Canberra");
  });
});

describe("finalizeAttempt", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("returns the server-tallied score + remaining attempts", async () => {
    mockFetch([{
      status: 200,
      body: { score: 17, wrongCount: 3, attemptsRemaining: 2, mode: "scored" },
    }]);
    const res = await finalizeAttempt("att-1");
    expect(res.score).toBe(17);
    expect(res.attemptsRemaining).toBe(2);
  });
});

describe("getLeaderboard", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("returns top + your rank", async () => {
    mockFetch([{
      status: 200,
      body: {
        top: [{ rank: 1, handle: "cobalt-otter", bestScore: 25, bestWrong: 0 }],
        yourRank: 5, yourBestToday: 17, totalPlayers: 10, dateUtc: "2026-04-29",
      },
    }]);
    const res = await getLeaderboard();
    expect(res.top).toHaveLength(1);
    expect(res.yourRank).toBe(5);
  });
});

describe("signupForNotify", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("posts email + returns ok", async () => {
    const fetchMock = mockFetch([{ status: 200, body: { ok: true, isDuplicate: false } }]);
    await signupForNotify("test@example.com");
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      email: "test@example.com",
      locale: undefined,
    });
  });

  it("propagates invalid_email error", async () => {
    mockFetch([{ status: 400, body: { error: "invalid_email" } }]);
    try {
      await signupForNotify("bogus");
    } catch (e) {
      expect((e as ApiError).code).toBe("invalid_email");
    }
  });
});

describe("submitAnswerWithRetry", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("succeeds on first try", async () => {
    mockFetch([{ status: 200, body: { correct: true, correctIdx: 0, fact: "", isDuplicate: false } }]);
    const res = await submitAnswerWithRetry({
      attemptId: "a", questionId: "q", choiceIdx: 0,
      maxRetries: 0, retryDelayMs: 0,
    });
    expect(res.correct).toBe(true);
  });

  it("retries on 5xx and succeeds on second attempt", async () => {
    const onRetry = vi.fn();
    mockFetch([
      { status: 503, body: { error: "service_unavailable" } },
      { status: 200, body: { correct: true, correctIdx: 0, fact: "", isDuplicate: false } },
    ]);
    const res = await submitAnswerWithRetry({
      attemptId: "a", questionId: "q", choiceIdx: 0,
      maxRetries: 5, retryDelayMs: 0,
      onRetry,
    });
    expect(res.correct).toBe(true);
    expect(onRetry).toHaveBeenCalledWith(1);
  });

  it("does NOT retry on 4xx (user fault)", async () => {
    const onRetry = vi.fn();
    mockFetch([{ status: 400, body: { error: "missing_fields" } }]);
    await expect(
      submitAnswerWithRetry({
        attemptId: "a", questionId: "q", choiceIdx: 0,
        maxRetries: 5, retryDelayMs: 0, onRetry,
      })
    ).rejects.toThrow(ApiError);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("gives up after maxRetries on persistent 5xx", async () => {
    mockFetch([{ status: 503, body: { error: "down" } }]); // reused for all attempts
    const onRetry = vi.fn();
    await expect(
      submitAnswerWithRetry({
        attemptId: "a", questionId: "q", choiceIdx: 0,
        maxRetries: 2, retryDelayMs: 0, onRetry,
      })
    ).rejects.toThrow(ApiError);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });
});
