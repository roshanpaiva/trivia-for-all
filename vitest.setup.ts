import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom doesn't ship a working SpeechSynthesisUtterance constructor; the audio
// service uses `new SpeechSynthesisUtterance(text)` directly. Polyfill the
// minimum surface our code touches so tests can inject a mock SpeechSynthesis.
if (typeof globalThis.SpeechSynthesisUtterance === "undefined") {
  class FakeSpeechSynthesisUtterance {
    text: string;
    voice: SpeechSynthesisVoice | null = null;
    rate = 1;
    pitch = 1;
    volume = 1;
    lang = "en-US";
    onstart: ((e: SpeechSynthesisEvent) => void) | null = null;
    onend: ((e: SpeechSynthesisEvent) => void) | null = null;
    onerror: ((e: SpeechSynthesisErrorEvent) => void) | null = null;
    onpause: ((e: SpeechSynthesisEvent) => void) | null = null;
    onresume: ((e: SpeechSynthesisEvent) => void) | null = null;
    onmark: ((e: SpeechSynthesisEvent) => void) | null = null;
    onboundary: ((e: SpeechSynthesisEvent) => void) | null = null;
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return true;
    }
    constructor(text: string) {
      this.text = text;
    }
  }
  // @ts-expect-error: jsdom omission, polyfilled for test environment only
  globalThis.SpeechSynthesisUtterance = FakeSpeechSynthesisUtterance;
}
