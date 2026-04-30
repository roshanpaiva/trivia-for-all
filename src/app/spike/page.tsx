"use client";

/**
 * V2 SPEECH RECOGNITION SPIKE — TEMPORARY PAGE
 *
 * Tests `webkitSpeechRecognition` on iPhone Safari + Android Chrome to decide
 * whether voice-first party mode is buildable for v2. See design doc:
 *   ~/.gstack/projects/roshanpaiva-trivia-for-all/...-audit-bank-124-design-*.md
 *
 * This page should be REMOVED after the spike completes (1-2 weeks max).
 * It's deliberately undocumented — not linked from anywhere, not in robots, not
 * in the sitemap. Direct URL only: /spike.
 *
 * What it tests:
 *   T1 — single-word recognition (5 trials, accuracy + latency)
 *   T2 — multi-word answers (5 trials)
 *   T3 — numeric answers (5 trials, the format-mismatch case)
 *   T4 — concurrent TTS + STT (the killer iOS Safari case)
 *   T5 — multi-question loop (10 questions back-to-back, watches for silent drops)
 *
 * Pass criteria (from design doc):
 *   - ≥90% accuracy on clean audio
 *   - ≥75% on noisy audio (run T1-T3 twice — once quiet, once with radio nearby)
 *   - <500ms latency from end-of-utterance to recognized text
 *   - Concurrent TTS+STT works OR clean graceful sequential
 *   - No silent failures
 */

import { useEffect, useRef, useState } from "react";

type Trial = {
  expected: string;
  heard: string | null;
  matched: boolean;
  latencyMs: number | null;
  error: string | null;
};

type TestResult = {
  testId: string;
  testName: string;
  trials: Trial[];
  accuracy: number;
  meanLatencyMs: number | null;
  finishedAt: string;
};

type SessionResult = {
  startedAt: string;
  userAgent: string;
  iosVersion: string | null;
  results: TestResult[];
};

const T1_WORDS = ["Apple", "Banana", "Brazil", "Mars", "Saturn"];
const T2_WORDS = ["New York", "United States", "Eiffel Tower", "Mona Lisa", "Hong Kong"];
const T3_WORDS = ["Twelve", "Nineteen eighty six", "Two thousand twenty", "Ninety", "Forty two"];
const T5_PROMPTS = [
  "What's the capital of France?",
  "Name a fruit that's red.",
  "Two plus two equals?",
  "What planet is closest to the sun?",
  "Name a primary color.",
  "What's the largest ocean?",
  "How many days in a week?",
  "Name a citrus fruit.",
  "What's the opposite of up?",
  "Name a color of the rainbow.",
];

const STORAGE_KEY = "tfa.spike.results";

// Loose match: case-insensitive, strip punctuation, allow substring either way,
// allow common numeric/word swaps (12 ↔ twelve, 1986 ↔ nineteen eighty six).
const NUMBER_WORDS: Record<string, string> = {
  "twelve": "12",
  "nineteen eighty six": "1986",
  "two thousand twenty": "2020",
  "ninety": "90",
  "forty two": "42",
};
const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
const matchAnswer = (heard: string, expected: string): boolean => {
  const h = normalize(heard);
  const e = normalize(expected);
  if (!h) return false;
  if (h === e) return true;
  if (h.includes(e) || e.includes(h)) return true;
  const numForm = NUMBER_WORDS[e];
  if (numForm && (h.includes(numForm) || normalize(numForm).includes(h))) return true;
  return false;
};

type SR = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: { 0: { 0: { transcript: string } } } & { length: number } }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechend: (() => void) | null;
  onstart: (() => void) | null;
};

const getRecognitionCtor = (): (new () => SR) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SR;
    webkitSpeechRecognition?: new () => SR;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const speak = async (text: string): Promise<void> => {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
};

export default function SpikePage() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [session, setSession] = useState<SessionResult | null>(null);
  const [activeTest, setActiveTest] = useState<string | null>(null);
  const [currentTrial, setCurrentTrial] = useState<{ expected: string; heard: string | null; status: string } | null>(
    null,
  );
  const [iosVersion, setIosVersion] = useState("");
  const recogRef = useRef<SR | null>(null);

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    setSupported(Ctor !== null);
    if (Ctor) {
      const r = new Ctor();
      r.continuous = false;
      r.lang = "en-US";
      r.interimResults = false;
      recogRef.current = r;
    }
    setSession({
      startedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      iosVersion: null,
      results: [],
    });
  }, []);

  const listen = (timeoutMs = 5000): Promise<{ heard: string | null; latencyMs: number; error: string | null }> => {
    return new Promise((resolve) => {
      const r = recogRef.current;
      if (!r) return resolve({ heard: null, latencyMs: 0, error: "no recognizer" });
      let started = 0;
      let resolved = false;
      const finish = (heard: string | null, error: string | null) => {
        if (resolved) return;
        resolved = true;
        const latencyMs = started ? Date.now() - started : 0;
        try { r.stop(); } catch { /* noop */ }
        resolve({ heard, latencyMs, error });
      };
      r.onstart = () => { started = Date.now(); setPermission("granted"); };
      r.onresult = (e) => {
        const t = e.results[0]?.[0]?.transcript ?? "";
        finish(t, null);
      };
      r.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "permission-denied") setPermission("denied");
        finish(null, e.error);
      };
      r.onend = () => finish(null, "no-speech");
      try {
        r.start();
      } catch (err) {
        finish(null, `start_failed: ${String(err)}`);
      }
      window.setTimeout(() => finish(null, "timeout"), timeoutMs);
    });
  };

  const runWordSet = async (testId: string, testName: string, words: string[], speakPrompt = false) => {
    setActiveTest(testId);
    const trials: Trial[] = [];
    for (const expected of words) {
      setCurrentTrial({ expected, heard: null, status: speakPrompt ? "Reading…" : `Say: ${expected}` });
      if (speakPrompt) {
        await speak(`Say ${expected}`);
      }
      setCurrentTrial({ expected, heard: null, status: "🎤 Listening… speak now" });
      // Small delay to give the user a beat
      await new Promise((r) => setTimeout(r, 300));
      const { heard, latencyMs, error } = await listen();
      const matched = heard ? matchAnswer(heard, expected) : false;
      trials.push({ expected, heard, matched, latencyMs: error ? null : latencyMs, error });
      setCurrentTrial({
        expected,
        heard,
        status: matched ? "✅ Match" : error ? `❌ ${error}` : `❌ heard "${heard}"`,
      });
      // Visible pause so the user sees the result
      await new Promise((r) => setTimeout(r, 1200));
    }
    const correct = trials.filter((t) => t.matched).length;
    const accuracy = correct / trials.length;
    const latencies = trials.map((t) => t.latencyMs).filter((n): n is number => n !== null);
    const meanLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;
    const result: TestResult = {
      testId,
      testName,
      trials,
      accuracy,
      meanLatencyMs,
      finishedAt: new Date().toISOString(),
    };
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, results: [...prev.results.filter((r) => r.testId !== testId), result] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
    setActiveTest(null);
    setCurrentTrial(null);
  };

  const exportJson = () => {
    if (!session) return;
    const final = { ...session, iosVersion: iosVersion || null };
    const blob = new Blob([JSON.stringify(final, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quizzle-spike-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tests: Array<{ id: string; name: string; words: string[]; speakPrompt: boolean; gate: string }> = [
    { id: "t1", name: "Single-word", words: T1_WORDS, speakPrompt: false, gate: "≥90% accuracy, <500ms latency" },
    { id: "t2", name: "Multi-word", words: T2_WORDS, speakPrompt: false, gate: "≥90% accuracy" },
    { id: "t3", name: "Numbers / years", words: T3_WORDS, speakPrompt: false, gate: "≥80% (number-form tolerance)" },
    { id: "t4", name: "Concurrent TTS+STT (killer)", words: T1_WORDS, speakPrompt: true, gate: "Same as T1 — tests if mic survives TTS" },
    { id: "t5", name: "Multi-question loop", words: T5_PROMPTS, speakPrompt: true, gate: "10 trials, no silent drops" },
  ];

  return (
    <main className="min-h-screen flex flex-col px-5 py-6 bg-[var(--canvas)] text-[var(--ink)]">
      <h1 className="font-display font-extrabold text-[28px] tracking-tight mb-2">Quizzle V2 — Speech Spike</h1>
      <p className="text-[14px] text-[var(--muted)] mb-4">
        Internal test page. Determines whether voice-first party mode is shippable.
      </p>

      <div className="mb-4 px-3 py-2 rounded-md border border-[var(--line)] bg-[var(--surface)] text-[13px]">
        <div><strong>API supported:</strong> {supported === null ? "checking…" : supported ? "✅ yes" : "❌ no (webkitSpeechRecognition missing)"}</div>
        <div><strong>Mic permission:</strong> {permission}</div>
        <div className="mt-2">
          <label className="block text-[12px] text-[var(--muted)] mb-1">iOS / OS version (optional but useful)</label>
          <input
            type="text"
            value={iosVersion}
            onChange={(e) => setIosVersion(e.target.value)}
            placeholder="e.g. iOS 26.3.1"
            className="w-full min-h-[40px] px-3 rounded-md border border-[var(--line)] bg-[var(--canvas)] text-[var(--ink)] text-[14px]"
          />
        </div>
      </div>

      {currentTrial && (
        <div className="mb-4 px-4 py-4 rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-soft)]">
          <div className="text-[12px] uppercase tracking-[0.12em] text-[var(--muted)]">Now</div>
          <div className="font-display font-bold text-[24px] text-[var(--ink)] mt-1">{currentTrial.status}</div>
          {currentTrial.expected && <div className="text-[16px] text-[var(--accent-strong)] mt-1">Expected: <strong>{currentTrial.expected}</strong></div>}
          {currentTrial.heard && <div className="text-[14px] text-[var(--muted)] mt-1">Heard: "{currentTrial.heard}"</div>}
        </div>
      )}

      <div className="space-y-3 mb-6">
        {tests.map((t) => {
          const result = session?.results.find((r) => r.testId === t.id);
          const isActive = activeTest === t.id;
          return (
            <div key={t.id} className="border border-[var(--line)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="font-display font-bold text-[18px]">{t.name}</div>
                {result && (
                  <div className={`text-[16px] font-bold tabular-nums ${result.accuracy >= 0.9 ? "text-[var(--success)]" : result.accuracy >= 0.7 ? "text-[var(--accent-strong)]" : "text-[var(--error)]"}`}>
                    {Math.round(result.accuracy * 100)}%
                  </div>
                )}
              </div>
              <div className="text-[12px] text-[var(--muted)] mb-3">Gate: {t.gate}</div>
              {result && (
                <div className="text-[12px] text-[var(--muted)] mb-3 tabular-nums">
                  {result.trials.filter((tr) => tr.matched).length} / {result.trials.length} matched · mean latency {result.meanLatencyMs !== null ? `${Math.round(result.meanLatencyMs)}ms` : "—"}
                </div>
              )}
              <button
                type="button"
                onClick={() => runWordSet(t.id, t.name, t.words, t.speakPrompt)}
                disabled={!supported || activeTest !== null}
                className="w-full min-h-[48px] rounded-md bg-[var(--ink)] text-[var(--canvas)] font-semibold text-[16px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isActive ? "Running…" : result ? `Re-run (${t.words.length} trials)` : `Run (${t.words.length} trials)`}
              </button>
              {result && result.trials.some((tr) => !tr.matched) && (
                <details className="mt-2 text-[12px]">
                  <summary className="cursor-pointer text-[var(--muted)]">Show trial-level results</summary>
                  <ul className="mt-2 space-y-1 font-mono">
                    {result.trials.map((tr, i) => (
                      <li key={i} className={tr.matched ? "text-[var(--success)]" : "text-[var(--error)]"}>
                        {tr.matched ? "✓" : "✗"} expected "{tr.expected}" → {tr.error ? `[${tr.error}]` : `heard "${tr.heard}"`} {tr.latencyMs !== null && `(${tr.latencyMs}ms)`}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-dashed border-[var(--line)] pt-4 mb-6">
        <div className="font-display font-bold text-[18px] mb-2">Export</div>
        <p className="text-[12px] text-[var(--muted)] mb-3">
          Run the tests, then export results as JSON. Send the file (or screenshots of the scorecard) back so we can score the spike.
        </p>
        <button
          type="button"
          onClick={exportJson}
          disabled={!session || session.results.length === 0}
          className="w-full min-h-[48px] rounded-md border border-[var(--ink)] bg-[var(--canvas)] text-[var(--ink)] font-semibold text-[16px] disabled:opacity-50"
        >
          Export results as JSON
        </button>
      </div>

      <div className="text-[11px] text-[var(--muted)] mt-auto">
        Spike v0.1 · /spike · this page is temporary and undocumented.
      </div>
    </main>
  );
}
