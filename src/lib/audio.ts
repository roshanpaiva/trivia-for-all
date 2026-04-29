/**
 * Audio service: TTS read-aloud + AudioContext unlock + visibility handling.
 *
 * Source of truth: design doc → "Audio Unlock Pattern" + CLAUDE.md → "TTS Strategy".
 *
 *     PATTERN
 *     ├── First user gesture: unlock() — primes AudioContext + speechSynthesis
 *     ├── speak(text) — utterance through unlocked context
 *     ├── cancel() — barge-in (called when player taps mid-read)
 *     ├── visibilitychange hidden  → pause TTS, signal pause to caller
 *     └── visibilitychange visible → resume TTS
 *
 * iOS Safari quirks handled:
 * - First speak() must occur synchronously inside the gesture handler — unlock()
 *   does this with a silent priming utterance.
 * - Voice list loads asynchronously; voiceschanged event triggers a refresh.
 * - Audio dies on tab background — pause/resume on visibilitychange.
 *
 * Day 0 spike (CLAUDE.md → TTS Strategy) confirmed browser TTS is good enough
 * for v1. The server-cached MP3 fallback is documented but not implemented — if
 * v1 user feedback complains about voice quality, this module is the swap point.
 */

export type AudioServiceEvents = {
  /** Fires when an utterance starts speaking. */
  onSpeakStart?: (text: string) => void;
  /** Fires when an utterance ends naturally. */
  onSpeakEnd?: () => void;
  /** Fires on speech error (browser failure, not network). */
  onSpeakError?: (error: string) => void;
  /** Fires when tab visibility changes. Caller pauses/resumes its game timer. */
  onVisibilityChange?: (visible: boolean) => void;
};

export type AudioServiceState = "locked" | "unlocked" | "speaking" | "paused";

export type AudioServiceConfig = {
  /** Defaults to window.speechSynthesis. Tests inject a mock. */
  speechSynthesis?: SpeechSynthesis;
  /** Defaults to window.AudioContext. Tests inject a mock. */
  AudioContextCtor?: typeof AudioContext;
  /** Defaults to document. Tests inject a mock for visibility events. */
  documentRef?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
};

/**
 * Construct an audio service. The service is safe to construct at module load
 * (no side effects). Call unlock() inside the user gesture handler that starts
 * a game.
 */
export const createAudioService = (
  events: AudioServiceEvents = {},
  config: AudioServiceConfig = {},
) => {
  const synth = config.speechSynthesis ?? (typeof window !== "undefined" ? window.speechSynthesis : undefined);
  const Ctx = config.AudioContextCtor ?? (typeof window !== "undefined"
    ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    : undefined);
  const doc = config.documentRef ?? (typeof document !== "undefined" ? document : undefined);

  let state: AudioServiceState = "locked";
  let audioCtx: AudioContext | null = null;
  let voices: SpeechSynthesisVoice[] = [];
  let visibilityHandler: (() => void) | null = null;

  const refreshVoices = () => {
    if (!synth) return;
    const all = synth.getVoices() ?? [];
    voices = all.filter((v) => v.lang.toLowerCase().startsWith("en"));
  };

  /**
   * Run inside a user gesture handler. Creates AudioContext, primes
   * speechSynthesis, attaches voiceschanged + visibilitychange listeners.
   * Idempotent — safe to call multiple times.
   */
  const unlock = (): void => {
    if (!synth || !Ctx) {
      // No browser APIs available (SSR, tests without mocks). Treat as unlocked
      // so the rest of the API is callable; speak() becomes a no-op.
      state = "unlocked";
      return;
    }

    if (state === "locked") {
      try {
        audioCtx = new Ctx();
        if (audioCtx.state === "suspended") {
          // resume() returns a promise; we don't await it (would break the
          // gesture lock). Failures are swallowed — best-effort.
          void audioCtx.resume();
        }
      } catch {
        // Some test environments throw on AudioContext construction; ignore.
        audioCtx = null;
      }

      // Silent priming utterance — must happen INSIDE the gesture handler
      try {
        const priming = new SpeechSynthesisUtterance(" ");
        priming.volume = 0;
        synth.speak(priming);
      } catch {
        // Some browsers throw if voices haven't loaded yet — swallow
      }

      // Voices may load async (iOS Safari, Android Chrome). Refresh on event.
      synth.addEventListener?.("voiceschanged", refreshVoices);
      refreshVoices();

      // Visibility handling: pause TTS when tab backgrounds, resume on return.
      // Caller should also pause/resume their own game timer via onVisibilityChange.
      if (doc) {
        visibilityHandler = () => {
          const visible = doc.visibilityState === "visible";
          if (visible) {
            if (state === "paused" && synth.paused) synth.resume();
            if (state === "paused") state = synth.speaking ? "speaking" : "unlocked";
          } else {
            if (synth.speaking) synth.pause();
            if (state === "speaking") state = "paused";
          }
          events.onVisibilityChange?.(visible);
        };
        doc.addEventListener("visibilitychange", visibilityHandler);
      }

      state = "unlocked";
    }
  };

  /**
   * Speak text. No-op if not unlocked (call unlock() first inside a gesture).
   * Cancels any in-flight utterance — safe to call from a barge-in handler.
   */
  const speak = (text: string): void => {
    if (!synth) return;
    if (state === "locked") {
      events.onSpeakError?.("Audio not unlocked. Call unlock() inside a user gesture first.");
      return;
    }
    if (text.trim().length === 0) return;

    // Always cancel before queueing — implements the barge-in pattern from
    // CLAUDE.md → TTS Strategy. Without this, two rapid speak() calls would
    // queue, and the next question's read would land on top of the previous.
    synth.cancel();

    const u = new SpeechSynthesisUtterance(text);
    if (voices.length > 0) {
      // Prefer a non-default voice if it sounds more human (caller can pick
      // explicitly later by extending this to take a voice name).
      u.voice = voices.find((v) => v.default) ?? voices[0];
    }
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 1.0;

    u.onstart = () => {
      state = "speaking";
      events.onSpeakStart?.(text);
    };
    u.onend = () => {
      if (state === "speaking") state = "unlocked";
      events.onSpeakEnd?.();
    };
    u.onerror = (e: SpeechSynthesisErrorEvent) => {
      if (state === "speaking") state = "unlocked";
      events.onSpeakError?.(e.error ?? "unknown");
    };

    synth.speak(u);
  };

  /**
   * Cancel any in-flight utterance. Used when the player barges in by tapping
   * a choice during READING.
   */
  const cancel = (): void => {
    if (!synth) return;
    synth.cancel();
    if (state === "speaking" || state === "paused") state = "unlocked";
  };

  /**
   * Detach all listeners + cancel any speech. Call on unmount or game-end.
   */
  const teardown = (): void => {
    cancel();
    if (synth) synth.removeEventListener?.("voiceschanged", refreshVoices);
    if (doc && visibilityHandler) doc.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
    if (audioCtx && audioCtx.state !== "closed") {
      void audioCtx.close().catch(() => {});
    }
    audioCtx = null;
    state = "locked";
  };

  return {
    unlock,
    speak,
    cancel,
    teardown,
    /** Inspect state — primarily for tests + UI status indicators. */
    getState: (): AudioServiceState => state,
    /** Inspect available voices — primarily for tests + voice-picker UI. */
    getVoices: (): SpeechSynthesisVoice[] => [...voices],
  };
};

export type AudioService = ReturnType<typeof createAudioService>;
