# TODOS

## Quizzle V2 — gating before Phase 1 build

### [GATING] Android Chrome STT spike
- **What:** Run the existing `/spike` page on an Android Chrome device (any modern Android phone). Capture the same 5-test scorecard (T1 single-word, T2 multi-word, T3 numbers, T4 concurrent TTS+STT, T5 multi-question loop). Add results to the design doc's Phase 0 Outcome scorecard table.
- **Why:** The STT watchdog (D4) was tuned around iOS Safari's silent-drop behavior. Android Chrome's `webkitSpeechRecognition` may have different restart cycles, different timeout patterns, and different concurrent-TTS handling. Without this data, the watchdog could thrash restarts on Android or fail to degrade when it should.
- **Pros:** Catches platform divergence before code is written. Validates the second gating device per the v1 TTS spike pattern.
- **Cons:** Requires access to an Android phone for ~10 minutes.
- **Context:** iPhone Safari spike already PASSED (iOS 26.3.1, 6/6 single-word, with occasional silent timeouts the watchdog handles). iPhone Chrome failed as expected (WKWebView constraint). Android Chrome is the second iPhone-equivalent gating device.
- **Depends on:** Access to an Android phone for ~10 min. Spike page lives at `https://tryquizzle.com/spike` (already deployed).
- **Captured:** /plan-eng-review session, 2026-04-30 (D13)

## Quizzle v2.1 (deferred from v2.0 per outside voice)

### Share-result button + viral loop
- **What:** PostGame share button (party mode) using `navigator.share()`. Deep-link consumption banner on Home when `?ref=share&group=X&score=N` present.
- **Why:** Cut from v2.0 per D12 — outside voice argued: validate the cooperative shout-loop with real families before committing to the social/competitive layer.
- **Captured:** /plan-eng-review session, 2026-04-30 (D12)

### iOS Chrome explicit nudge banner
- **What:** When `navigator.userAgent` matches iOS + non-Safari (CriOS, etc.) AND user enters Party mode, show banner: "Voice answering needs Safari on iPhone — tap below to keep playing tap-only, or open this page in Safari."
- **Why:** Polish on top of the silent graceful degradation that ships in v2.0. Cut per D1 to keep v2.0 lean.
- **Captured:** /plan-eng-review session, 2026-04-30 (D1)

### Mode persistence (localStorage)
- **What:** Save `quizzle.preferredMode` to localStorage so returning party-mode players don't have to re-pick Party each visit.
- **Why:** Small UX win, deferred per D1 to keep v2.0 file count down.
- **Captured:** /plan-eng-review session, 2026-04-30 (D1)
