/**
 * Tests for the audio service. jsdom doesn't ship a working speechSynthesis
 * implementation, so we inject mocks via the AudioServiceConfig hooks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAudioService } from "@/lib/audio";

type Listener = () => void;

/** Minimal SpeechSynthesis mock that records calls + supports listeners. */
const makeSynthMock = () => {
  const listeners = new Map<string, Set<Listener>>();
  let voices: SpeechSynthesisVoice[] = [];
  let speaking = false;
  let paused = false;
  const utterances: SpeechSynthesisUtterance[] = [];

  const synth = {
    speak: vi.fn((u: SpeechSynthesisUtterance) => {
      utterances.push(u);
      speaking = true;
      // Fire onstart synchronously for test simplicity
      queueMicrotask(() => u.onstart?.(new Event("start") as SpeechSynthesisEvent));
    }),
    cancel: vi.fn(() => {
      speaking = false;
      paused = false;
    }),
    pause: vi.fn(() => {
      paused = true;
    }),
    resume: vi.fn(() => {
      paused = false;
    }),
    getVoices: vi.fn(() => voices),
    addEventListener: vi.fn((event: string, listener: Listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    }),
    removeEventListener: vi.fn((event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener);
    }),
    get speaking() {
      return speaking;
    },
    get paused() {
      return paused;
    },
  } as unknown as SpeechSynthesis;

  return {
    synth,
    setVoices: (v: Partial<SpeechSynthesisVoice>[]) => {
      voices = v as SpeechSynthesisVoice[];
      // Fire voiceschanged
      listeners.get("voiceschanged")?.forEach((l) => l());
    },
    fireEnd: () => {
      const u = utterances[utterances.length - 1];
      speaking = false;
      u?.onend?.(new Event("end") as SpeechSynthesisEvent);
    },
    fireError: (error: string) => {
      const u = utterances[utterances.length - 1];
      speaking = false;
      const e = { error } as SpeechSynthesisErrorEvent;
      u?.onerror?.(e);
    },
    utterances,
  };
};

/** Minimal AudioContext mock. */
const makeAudioCtxCtor = () => {
  const instances: Array<{ state: string; resume: () => Promise<void>; close: () => Promise<void> }> = [];
  const Ctor = vi.fn(function () {
    const inst = {
      state: "suspended" as string,
      resume: vi.fn(() => {
        inst.state = "running";
        return Promise.resolve();
      }),
      close: vi.fn(() => {
        inst.state = "closed";
        return Promise.resolve();
      }),
    };
    instances.push(inst);
    return inst;
  }) as unknown as typeof AudioContext;
  return { Ctor, instances };
};

/** Minimal document mock for visibilitychange. */
const makeDocMock = () => {
  const listeners = new Map<string, Set<Listener>>();
  const doc = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: vi.fn((event: string, listener: Listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    }),
    removeEventListener: vi.fn((event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener);
    }),
  };
  const fireVisibility = (state: DocumentVisibilityState) => {
    doc.visibilityState = state;
    listeners.get("visibilitychange")?.forEach((l) => l());
  };
  return { doc, fireVisibility };
};

describe("createAudioService — initial state", () => {
  it("starts locked", () => {
    const { synth } = makeSynthMock();
    const { Ctor } = makeAudioCtxCtor();
    const { doc } = makeDocMock();
    const svc = createAudioService(
      {},
      { speechSynthesis: synth, AudioContextCtor: Ctor, documentRef: doc },
    );
    expect(svc.getState()).toBe("locked");
  });

  it("speak() before unlock fires onSpeakError and is a no-op", () => {
    const { synth } = makeSynthMock();
    const { Ctor } = makeAudioCtxCtor();
    const { doc } = makeDocMock();
    const onSpeakError = vi.fn();
    const svc = createAudioService(
      { onSpeakError },
      { speechSynthesis: synth, AudioContextCtor: Ctor, documentRef: doc },
    );
    svc.speak("hello");
    expect(onSpeakError).toHaveBeenCalledTimes(1);
    expect(onSpeakError).toHaveBeenCalledWith(expect.stringContaining("unlock"));
    expect(synth.speak).not.toHaveBeenCalled();
  });
});

describe("createAudioService — unlock", () => {
  let mocks: ReturnType<typeof setupMocks>;

  function setupMocks() {
    const synthMock = makeSynthMock();
    const audioCtxMock = makeAudioCtxCtor();
    const docMock = makeDocMock();
    return {
      ...synthMock,
      audioCtx: audioCtxMock,
      doc: docMock.doc,
      fireVisibility: docMock.fireVisibility,
    };
  }

  beforeEach(() => {
    mocks = setupMocks();
  });

  it("unlock() creates an AudioContext and primes speechSynthesis with a silent utterance", () => {
    const svc = createAudioService(
      {},
      {
        speechSynthesis: mocks.synth,
        AudioContextCtor: mocks.audioCtx.Ctor,
        documentRef: mocks.doc,
      },
    );
    svc.unlock();
    expect(svc.getState()).toBe("unlocked");
    expect(mocks.audioCtx.Ctor).toHaveBeenCalledTimes(1);
    expect(mocks.synth.speak).toHaveBeenCalledTimes(1);
    const primingUtterance = vi.mocked(mocks.synth.speak).mock.calls[0][0];
    expect(primingUtterance.volume).toBe(0);
  });

  it("unlock() is idempotent — second call doesn't re-create AudioContext", () => {
    const svc = createAudioService(
      {},
      {
        speechSynthesis: mocks.synth,
        AudioContextCtor: mocks.audioCtx.Ctor,
        documentRef: mocks.doc,
      },
    );
    svc.unlock();
    svc.unlock();
    expect(mocks.audioCtx.Ctor).toHaveBeenCalledTimes(1);
    expect(mocks.synth.speak).toHaveBeenCalledTimes(1);
  });

  it("unlock() resumes a suspended AudioContext", () => {
    const svc = createAudioService(
      {},
      {
        speechSynthesis: mocks.synth,
        AudioContextCtor: mocks.audioCtx.Ctor,
        documentRef: mocks.doc,
      },
    );
    svc.unlock();
    expect(mocks.audioCtx.instances[0].resume).toHaveBeenCalled();
  });

  it("unlock() registers voiceschanged listener and refreshes voices", () => {
    const svc = createAudioService(
      {},
      {
        speechSynthesis: mocks.synth,
        AudioContextCtor: mocks.audioCtx.Ctor,
        documentRef: mocks.doc,
      },
    );
    svc.unlock();
    expect(mocks.synth.addEventListener).toHaveBeenCalledWith("voiceschanged", expect.any(Function));
    mocks.setVoices([
      { name: "Samantha", lang: "en-US", default: true } as SpeechSynthesisVoice,
      { name: "Daniel", lang: "en-GB", default: false } as SpeechSynthesisVoice,
      { name: "Amelie", lang: "fr-FR", default: false } as SpeechSynthesisVoice,
    ]);
    const voices = svc.getVoices();
    expect(voices).toHaveLength(2); // French filtered out
    expect(voices.map((v) => v.name)).toEqual(["Samantha", "Daniel"]);
  });

  it("unlock() with no browser APIs available is a no-op (SSR safety)", () => {
    const svc = createAudioService(
      {},
      {
        speechSynthesis: undefined,
        AudioContextCtor: undefined,
        documentRef: undefined,
      },
    );
    expect(() => svc.unlock()).not.toThrow();
    expect(svc.getState()).toBe("unlocked");
  });
});

describe("createAudioService — speak", () => {
  it("speak() after unlock queues a real utterance", () => {
    const synthMock = makeSynthMock();
    const audioCtxMock = makeAudioCtxCtor();
    const docMock = makeDocMock();
    const svc = createAudioService(
      {},
      {
        speechSynthesis: synthMock.synth,
        AudioContextCtor: audioCtxMock.Ctor,
        documentRef: docMock.doc,
      },
    );
    svc.unlock();
    svc.speak("What is the capital of Australia?");
    // 1 priming + 1 real
    expect(synthMock.synth.speak).toHaveBeenCalledTimes(2);
    const real = vi.mocked(synthMock.synth.speak).mock.calls[1][0];
    expect(real.text).toBe("What is the capital of Australia?");
    expect(real.volume).toBe(1.0);
    expect(real.rate).toBe(1.0);
  });

  it("speak() cancels any in-flight utterance first (barge-in pattern)", () => {
    const synthMock = makeSynthMock();
    const audioCtxMock = makeAudioCtxCtor();
    const docMock = makeDocMock();
    const svc = createAudioService(
      {},
      {
        speechSynthesis: synthMock.synth,
        AudioContextCtor: audioCtxMock.Ctor,
        documentRef: docMock.doc,
      },
    );
    svc.unlock();
    svc.speak("first");
    svc.speak("second");
    // cancel called twice (once per speak)
    expect(synthMock.synth.cancel).toHaveBeenCalledTimes(2);
  });

  it("speak() with empty text is a no-op", () => {
    const synthMock = makeSynthMock();
    const audioCtxMock = makeAudioCtxCtor();
    const docMock = makeDocMock();
    const svc = createAudioService(
      {},
      {
        speechSynthesis: synthMock.synth,
        AudioContextCtor: audioCtxMock.Ctor,
        documentRef: docMock.doc,
      },
    );
    svc.unlock();
    const callsBefore = vi.mocked(synthMock.synth.speak).mock.calls.length;
    svc.speak("");
    svc.speak("   ");
    expect(vi.mocked(synthMock.synth.speak).mock.calls.length).toBe(callsBefore);
  });

  it("speak() fires onSpeakStart and onSpeakEnd in order", async () => {
    const onSpeakStart = vi.fn();
    const onSpeakEnd = vi.fn();
    const synthMock = makeSynthMock();
    const audioCtxMock = makeAudioCtxCtor();
    const docMock = makeDocMock();
    const svc = createAudioService(
      { onSpeakStart, onSpeakEnd },
      {
        speechSynthesis: synthMock.synth,
        AudioContextCtor: audioCtxMock.Ctor,
        documentRef: docMock.doc,
      },
    );
    svc.unlock();
    svc.speak("hello");
    await new Promise((r) => queueMicrotask(() => r(undefined)));
    expect(onSpeakStart).toHaveBeenCalledWith("hello");
    expect(svc.getState()).toBe("speaking");
    synthMock.fireEnd();
    expect(onSpeakEnd).toHaveBeenCalled();
    expect(svc.getState()).toBe("unlocked");
  });

  it("speak() error fires onSpeakError and resets state", async () => {
    const onSpeakError = vi.fn();
    const synthMock = makeSynthMock();
    const audioCtxMock = makeAudioCtxCtor();
    const docMock = makeDocMock();
    const svc = createAudioService(
      { onSpeakError },
      {
        speechSynthesis: synthMock.synth,
        AudioContextCtor: audioCtxMock.Ctor,
        documentRef: docMock.doc,
      },
    );
    svc.unlock();
    svc.speak("test");
    await new Promise((r) => queueMicrotask(() => r(undefined)));
    synthMock.fireError("synthesis-failed");
    expect(onSpeakError).toHaveBeenCalledWith("synthesis-failed");
    expect(svc.getState()).toBe("unlocked");
  });
});

describe("createAudioService — cancel", () => {
  it("cancel() invokes synth.cancel() and resets state from speaking", async () => {
    const synthMock = makeSynthMock();
    const audioCtxMock = makeAudioCtxCtor();
    const docMock = makeDocMock();
    const svc = createAudioService(
      {},
      {
        speechSynthesis: synthMock.synth,
        AudioContextCtor: audioCtxMock.Ctor,
        documentRef: docMock.doc,
      },
    );
    svc.unlock();
    svc.speak("a long passage");
    await new Promise((r) => queueMicrotask(() => r(undefined)));
    expect(svc.getState()).toBe("speaking");
    svc.cancel();
    expect(synthMock.synth.cancel).toHaveBeenCalled();
    expect(svc.getState()).toBe("unlocked");
  });
});

describe("createAudioService — visibility handling", () => {
  it("hidden → pauses speech, fires onVisibilityChange(false)", async () => {
    const onVisibilityChange = vi.fn();
    const synthMock = makeSynthMock();
    const audioCtxMock = makeAudioCtxCtor();
    const docMock = makeDocMock();
    const svc = createAudioService(
      { onVisibilityChange },
      {
        speechSynthesis: synthMock.synth,
        AudioContextCtor: audioCtxMock.Ctor,
        documentRef: docMock.doc,
      },
    );
    svc.unlock();
    svc.speak("test");
    await new Promise((r) => queueMicrotask(() => r(undefined)));
    docMock.fireVisibility("hidden");
    expect(synthMock.synth.pause).toHaveBeenCalled();
    expect(onVisibilityChange).toHaveBeenCalledWith(false);
    expect(svc.getState()).toBe("paused");
  });

  it("hidden → visible resumes speech, fires onVisibilityChange(true)", async () => {
    const onVisibilityChange = vi.fn();
    const synthMock = makeSynthMock();
    const audioCtxMock = makeAudioCtxCtor();
    const docMock = makeDocMock();
    const svc = createAudioService(
      { onVisibilityChange },
      {
        speechSynthesis: synthMock.synth,
        AudioContextCtor: audioCtxMock.Ctor,
        documentRef: docMock.doc,
      },
    );
    svc.unlock();
    svc.speak("test");
    await new Promise((r) => queueMicrotask(() => r(undefined)));
    docMock.fireVisibility("hidden");
    docMock.fireVisibility("visible");
    expect(synthMock.synth.resume).toHaveBeenCalled();
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
  });
});

describe("createAudioService — teardown", () => {
  it("teardown removes listeners and closes AudioContext", () => {
    const synthMock = makeSynthMock();
    const audioCtxMock = makeAudioCtxCtor();
    const docMock = makeDocMock();
    const svc = createAudioService(
      {},
      {
        speechSynthesis: synthMock.synth,
        AudioContextCtor: audioCtxMock.Ctor,
        documentRef: docMock.doc,
      },
    );
    svc.unlock();
    svc.teardown();
    expect(synthMock.synth.cancel).toHaveBeenCalled();
    expect(synthMock.synth.removeEventListener).toHaveBeenCalledWith(
      "voiceschanged",
      expect.any(Function),
    );
    expect(docMock.doc.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(audioCtxMock.instances[0].close).toHaveBeenCalled();
    expect(svc.getState()).toBe("locked");
  });

  it("teardown is safe to call without unlock()", () => {
    const synthMock = makeSynthMock();
    const audioCtxMock = makeAudioCtxCtor();
    const docMock = makeDocMock();
    const svc = createAudioService(
      {},
      {
        speechSynthesis: synthMock.synth,
        AudioContextCtor: audioCtxMock.Ctor,
        documentRef: docMock.doc,
      },
    );
    expect(() => svc.teardown()).not.toThrow();
  });
});
