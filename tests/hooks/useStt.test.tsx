import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStt, type SpeechRecognitionLike } from "@/hooks/useStt";

/** Fake SpeechRecognition with manual control over the lifecycle events.
 * Tests can call `triggerResult`, `triggerEnd`, `triggerError` to simulate
 * what the real browser API would do asynchronously. */
class FakeRecognition implements SpeechRecognitionLike {
  continuous = false;
  interimResults = false;
  lang = "en-US";
  onresult: SpeechRecognitionLike["onresult"] = null;
  onend: SpeechRecognitionLike["onend"] = null;
  onerror: SpeechRecognitionLike["onerror"] = null;

  startCalls = 0;
  abortCalls = 0;
  stopCalls = 0;

  start() { this.startCalls++; }
  stop() { this.stopCalls++; }
  abort() { this.abortCalls++; }

  triggerResult(transcript: string) {
    this.onresult?.({ results: [[{ transcript }]] });
    this.onend?.();
  }
  triggerSilentEnd() { this.onend?.(); }
  triggerError(error = "no-speech") {
    this.onerror?.({ error });
    this.onend?.();
  }
}

let instances: FakeRecognition[] = [];
const factory = () => {
  const r = new FakeRecognition();
  instances.push(r);
  return r;
};

beforeEach(() => {
  instances = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useStt — basic lifecycle", () => {
  it("supported=true when factory returns an instance", () => {
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult: () => {}, factory }),
    );
    expect(result.current.supported).toBe(true);
  });

  it("supported flips to false when factory returns null on the first start()", () => {
    // Lazy detection: we don't side-effect on mount. Calling start() is the
    // first chance to discover the browser doesn't expose STT.
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult: () => {}, factory: () => (null as unknown as SpeechRecognitionLike) }),
    );
    act(() => result.current.start());
    expect(result.current.supported).toBe(false);
    expect(result.current.phase).toBe("off"); // bailed out
  });

  it("starts in 'off' phase", () => {
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult: () => {}, factory }),
    );
    expect(result.current.phase).toBe("off");
  });

  it("start() transitions to 'listening' and calls underlying start()", () => {
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult: () => {}, factory }),
    );
    act(() => result.current.start());
    expect(result.current.phase).toBe("listening");
    expect(instances).toHaveLength(1);
    expect(instances[0].startCalls).toBe(1);
  });

  it("does NOT start when enabled=false", () => {
    const { result } = renderHook(() =>
      useStt({ enabled: false, onResult: () => {}, factory }),
    );
    act(() => result.current.start());
    expect(result.current.phase).toBe("off");
    expect(instances).toHaveLength(0);
  });
});

describe("useStt — happy path: result delivery", () => {
  it("invokes onResult with the transcript and returns to 'off'", () => {
    const onResult = vi.fn();
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult, factory }),
    );
    act(() => result.current.start());
    act(() => instances[0].triggerResult("twelve stars"));
    expect(onResult).toHaveBeenCalledWith("twelve stars");
    expect(result.current.phase).toBe("off");
  });

  it("ignores empty transcripts (does NOT call onResult)", () => {
    const onResult = vi.fn();
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult, factory }),
    );
    act(() => result.current.start());
    act(() => instances[0].triggerResult(""));
    expect(onResult).not.toHaveBeenCalled();
  });
});

describe("useStt — still-listening transition (DD4)", () => {
  it("transitions to 'still-listening' after stillListeningMs of silence", () => {
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult: () => {}, factory, stillListeningMs: 4000 }),
    );
    act(() => result.current.start());
    expect(result.current.phase).toBe("listening");
    act(() => { vi.advanceTimersByTime(4000); });
    expect(result.current.phase).toBe("still-listening");
  });

  it("does NOT transition if a result arrives first", () => {
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult: () => {}, factory, stillListeningMs: 4000 }),
    );
    act(() => result.current.start());
    act(() => instances[0].triggerResult("answer"));
    act(() => { vi.advanceTimersByTime(4000); });
    expect(result.current.phase).toBe("off");
  });
});

describe("useStt — three-tier watchdog (eng D4)", () => {
  it("Tier 1: silent drop restarts immediately (same listen cycle)", () => {
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult: () => {}, factory }),
    );
    act(() => result.current.start());
    expect(instances).toHaveLength(1);
    // Browser silently ends with no result.
    act(() => instances[0].triggerSilentEnd());
    // Watchdog should have spun up a fresh recognition instance.
    expect(instances).toHaveLength(2);
    // Phase remains 'listening' (still trying).
    expect(result.current.phase).toBe("listening");
  });

  it("Tier 2: degrades after MAX_CONSECUTIVE_FAILS (2) silent drops", () => {
    const onDegrade = vi.fn();
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult: () => {}, onDegrade, factory }),
    );
    act(() => result.current.start());
    act(() => instances[0].triggerSilentEnd());
    // Tier 1 restart happened.
    expect(result.current.phase).toBe("listening");
    expect(instances).toHaveLength(2);
    // Second silent drop → degrade.
    act(() => instances[1].triggerSilentEnd());
    expect(result.current.phase).toBe("degraded");
    expect(onDegrade).toHaveBeenCalledTimes(1);
    // No further restart attempts.
    expect(instances).toHaveLength(2);
  });

  it("a successful result resets the failure counter", () => {
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult: () => {}, factory }),
    );
    act(() => result.current.start());
    // 1 silent drop → tier 1 restart.
    act(() => instances[0].triggerSilentEnd());
    // Now succeed.
    act(() => instances[1].triggerResult("apple"));
    // Caller starts a new listen for the next question.
    act(() => result.current.start());
    // 1 silent drop again — should NOT degrade (counter was reset).
    act(() => instances[2].triggerSilentEnd());
    expect(result.current.phase).toBe("listening");
    expect(instances).toHaveLength(4); // restarted again, tier 1
  });

  it("error is treated like a silent drop for watchdog purposes", () => {
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult: () => {}, factory }),
    );
    act(() => result.current.start());
    act(() => instances[0].triggerError("not-allowed"));
    // Counter should have incremented; tier 1 restart kicked in.
    expect(instances).toHaveLength(2);
  });

  it("does NOT start in 'degraded' phase even if start() called again", () => {
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult: () => {}, factory }),
    );
    act(() => result.current.start());
    act(() => instances[0].triggerSilentEnd());
    act(() => instances[1].triggerSilentEnd());
    expect(result.current.phase).toBe("degraded");
    const before = instances.length;
    act(() => result.current.start());
    expect(instances.length).toBe(before); // refused
  });
});

describe("useStt — controls", () => {
  it("stop() aborts an in-flight recognition", () => {
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult: () => {}, factory }),
    );
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(instances[0].abortCalls).toBe(1);
    expect(result.current.phase).toBe("off");
  });

  it("reset() clears the watchdog state (post-degrade recovery via re-enable cycle)", () => {
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult: () => {}, factory }),
    );
    act(() => result.current.start());
    act(() => instances[0].triggerSilentEnd());
    act(() => instances[1].triggerSilentEnd());
    expect(result.current.phase).toBe("degraded");
    act(() => result.current.reset());
    expect(result.current.phase).toBe("off");
    // Now start works again, fail counter is back to 0.
    act(() => result.current.start());
    act(() => instances[2].triggerSilentEnd());
    // Should still be in tier 1 (1 fail), not degraded yet.
    expect(result.current.phase).toBe("listening");
  });

  it("flipping enabled=false mid-flight kills the recognition", () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useStt({ enabled, onResult: () => {}, factory }),
      { initialProps: { enabled: true } },
    );
    act(() => result.current.start());
    expect(instances[0].abortCalls).toBe(0);
    rerender({ enabled: false });
    expect(instances[0].abortCalls).toBe(1);
    expect(result.current.phase).toBe("off");
  });
});

describe("useStt — idempotency", () => {
  it("start() while already listening is a no-op", () => {
    const { result } = renderHook(() =>
      useStt({ enabled: true, onResult: () => {}, factory }),
    );
    act(() => result.current.start());
    act(() => result.current.start());
    expect(instances).toHaveLength(1);
    expect(instances[0].startCalls).toBe(1);
  });
});
