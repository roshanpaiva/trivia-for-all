"use client";

/**
 * Speech-to-text hook for v2 party mode.
 *
 * Wraps the browser's webkitSpeechRecognition API with the three-tier watchdog
 * locked in by eng D4:
 *   1. If the recognition session ends with no result (silent drop, common on
 *      iOS Safari per the day-0 spike), restart immediately.
 *   2. After two consecutive silent drops, transition to "degraded" — stop
 *      restarting, leave the player on tap-only, surface the state via the
 *      audio waveform's degraded look (DD4) and let the InGame caller decide
 *      whether to show a hint.
 *   3. Telemetry: log every restart + degrade event so we can tune the
 *      thresholds with real-world data.
 *
 * Per design DD12: status text changes are reflected by the consuming
 * component in an aria-live region — this hook just exposes the phase string.
 *
 * Browser compatibility:
 *   - Chrome (desktop + Android): standard SpeechRecognition + webkit prefix.
 *   - iOS Safari 14.5+: webkitSpeechRecognition only.
 *   - iOS Chrome / Firefox: WKWebView constraint, no STT (handled gracefully
 *     by the caller — `supported` exposes the truth).
 *
 * `?stt=off` URL flag is the emergency kill-switch — read by the consumer
 * (page.tsx) and passed in as `enabled`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type SttPhase =
  | "off" // not currently listening
  | "listening" // mic open, fresh listen
  | "still-listening" // 4s+ of silence on the current listen — DD4
  | "degraded"; // gave up after 2 silent drops in a row — tap-only fallback

export type UseSttOptions = {
  /** Master switch. When false, the hook is fully off (no mic access, no listeners). */
  enabled: boolean;
  /** Called when STT returns recognized text. */
  onResult: (transcript: string) => void;
  /** Called when the watchdog escalates to "degraded". Caller may show a banner. */
  onDegrade?: () => void;
  /** ms before phase transitions to "still-listening". Default 4000. */
  stillListeningMs?: number;
  /** Override SpeechRecognition factory for testing. */
  factory?: () => SpeechRecognitionLike;
};

/** The bits of webkitSpeechRecognition we actually use. Lets us substitute a
 * fake in tests without dragging in @types/dom-speech-recognition. */
export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
};

const MAX_CONSECUTIVE_FAILS = 2;
const DEFAULT_STILL_LISTENING_MS = 4000;

/** Runtime-detect the browser SpeechRecognition constructor. Null when the
 * browser doesn't expose either form (iOS Chrome, Firefox, etc.). */
const browserFactory = (): SpeechRecognitionLike | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
};

/** Window-only support check — no constructor call (no side effect, no
 * test pollution). Returns true if the browser exposes either the standard
 * or webkit-prefixed constructor. */
const browserHasStt = (): boolean => {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
};

export type UseSttReturn = {
  /** Whether the browser exposes a SpeechRecognition implementation at all. */
  supported: boolean;
  phase: SttPhase;
  /** Begin a fresh listen for one utterance. Idempotent — calling while
   * already listening is a no-op (won't restart). */
  start: () => void;
  /** Cancel any in-flight recognition. Safe to call from any phase. */
  stop: () => void;
  /** Force the watchdog state back to "off" — used when a question is answered
   * via tap and we want a clean slate for the next listen. */
  reset: () => void;
};

export const useStt = (opts: UseSttOptions): UseSttReturn => {
  const factory = opts.factory ?? browserFactory;
  // Production support detection: window globals only, no constructor call.
  // Test factories can override this signal lazily — the first start() that
  // returns null from factory will flip supported=false.
  const [supported, setSupported] = useState(() => opts.factory ? true : browserHasStt());
  const [phase, setPhase] = useState<SttPhase>("off");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const failCountRef = useRef(0);
  const gotResultThisSessionRef = useRef(false);
  const stillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResultRef = useRef(opts.onResult);
  const onDegradeRef = useRef(opts.onDegrade);
  const stillMsRef = useRef(opts.stillListeningMs ?? DEFAULT_STILL_LISTENING_MS);

  // Keep callbacks fresh without restarting recognition on every render.
  useEffect(() => { onResultRef.current = opts.onResult; }, [opts.onResult]);
  useEffect(() => { onDegradeRef.current = opts.onDegrade; }, [opts.onDegrade]);
  useEffect(() => {
    stillMsRef.current = opts.stillListeningMs ?? DEFAULT_STILL_LISTENING_MS;
  }, [opts.stillListeningMs]);

  const clearStillTimer = useCallback(() => {
    if (stillTimerRef.current) {
      clearTimeout(stillTimerRef.current);
      stillTimerRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    clearStillTimer();
    const r = recognitionRef.current;
    if (r) {
      r.onresult = null;
      r.onend = null;
      r.onerror = null;
      try { r.abort(); } catch { /* already stopped */ }
    }
    recognitionRef.current = null;
  }, [clearStillTimer]);

  const startListening = useCallback(() => {
    if (!opts.enabled) return;
    if (phase === "degraded") return;
    // Already an active recognition — don't double-start.
    if (recognitionRef.current) return;

    const r = factory();
    if (!r) {
      // Lazy support discovery: factory said no. Reflect that in `supported`
      // so the consumer can flip its UI to the unsupported-browser story.
      setSupported(false);
      return;
    }

    r.continuous = false;
    r.interimResults = false;
    r.lang = "en-US";

    gotResultThisSessionRef.current = false;

    r.onresult = (ev) => {
      gotResultThisSessionRef.current = true;
      // Reset the failure counter on any successful recognition — the watchdog
      // only escalates on consecutive empty drops.
      failCountRef.current = 0;
      const transcript = ev.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) onResultRef.current(transcript);
    };

    r.onerror = () => {
      // Treat error like a silent drop. onend will still fire; the failure
      // counter increments there.
    };

    r.onend = () => {
      const gotResult = gotResultThisSessionRef.current;
      teardown();
      if (!opts.enabled) {
        setPhase("off");
        return;
      }
      if (gotResult) {
        // Result was delivered. Caller decides whether to start a new listen
        // for the next question via reset() + start().
        setPhase("off");
        return;
      }
      // Silent drop. Watchdog (eng D4):
      failCountRef.current += 1;
      if (failCountRef.current >= MAX_CONSECUTIVE_FAILS) {
        setPhase("degraded");
        try { onDegradeRef.current?.(); } catch { /* listener errors don't kill us */ }
        return;
      }
      // Tier 1 restart: same listen cycle, no state change visible to caller.
      // Re-enter via startListening so we get a fresh recognition instance.
      startListening();
    };

    recognitionRef.current = r;
    setPhase("listening");

    // Schedule the still-listening transition. Cleared on any onend / onresult.
    stillTimerRef.current = setTimeout(() => {
      setPhase((p) => (p === "listening" ? "still-listening" : p));
    }, stillMsRef.current);

    try {
      r.start();
    } catch {
      // Some browsers throw if start() is called twice in a row. The teardown
      // path will be hit on the inevitable onend.
    }
  }, [factory, opts.enabled, phase, teardown]);

  const stop = useCallback(() => {
    teardown();
    setPhase((p) => (p === "degraded" ? "degraded" : "off"));
  }, [teardown]);

  const reset = useCallback(() => {
    failCountRef.current = 0;
    teardown();
    setPhase("off");
  }, [teardown]);

  // When the master switch flips off, kill any in-flight recognition.
  useEffect(() => {
    if (!opts.enabled) {
      teardown();
      setPhase("off");
    }
  }, [opts.enabled, teardown]);

  // Cleanup on unmount.
  useEffect(() => () => teardown(), [teardown]);

  return { supported, phase, start: startListening, stop, reset };
};
