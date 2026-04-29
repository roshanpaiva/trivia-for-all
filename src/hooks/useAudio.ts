"use client";

/**
 * React adapter around `createAudioService`. Owns the lifecycle (unlock once,
 * teardown on unmount) and exposes `speak`, `cancel`, and the current state.
 *
 * Caller wires the lifecycle:
 *   1. Render Home with Start button
 *   2. On Start tap: call `unlock()` synchronously inside the click handler
 *      (iOS Safari requires this)
 *   3. Use `speak()` for each question + reveal + streak announcement
 *   4. The hook auto-unmounts via teardown when the component goes away
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { createAudioService, type AudioService, type AudioServiceState } from "@/lib/audio";

export type UseAudioReturn = {
  state: AudioServiceState;
  unlock: () => void;
  speak: (text: string) => void;
  cancel: () => void;
  /** True after `unlock()` has been called inside a user gesture. */
  isUnlocked: boolean;
};

export const useAudio = (): UseAudioReturn => {
  const serviceRef = useRef<AudioService | null>(null);
  const [state, setState] = useState<AudioServiceState>("locked");

  if (serviceRef.current === null) {
    serviceRef.current = createAudioService({
      onSpeakStart: () => setState("speaking"),
      onSpeakEnd: () => setState(serviceRef.current?.getState() ?? "unlocked"),
      onSpeakError: () => setState(serviceRef.current?.getState() ?? "unlocked"),
      onVisibilityChange: () => setState(serviceRef.current?.getState() ?? "unlocked"),
    });
  }

  useEffect(() => {
    return () => {
      serviceRef.current?.teardown();
      serviceRef.current = null;
    };
  }, []);

  const unlock = useCallback(() => {
    serviceRef.current?.unlock();
    setState(serviceRef.current?.getState() ?? "unlocked");
  }, []);

  const speak = useCallback((text: string) => {
    serviceRef.current?.speak(text);
  }, []);

  const cancel = useCallback(() => {
    serviceRef.current?.cancel();
    setState(serviceRef.current?.getState() ?? "unlocked");
  }, []);

  return { state, unlock, speak, cancel, isUnlocked: state !== "locked" };
};
