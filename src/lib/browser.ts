/**
 * Browser detection helpers.
 *
 * Used sparingly — feature detection beats UA sniffing 99% of the time. We
 * sniff here only for the cases where the platform LIES about feature support
 * and the lie costs the user (iOS WKWebView exposes `webkitSpeechRecognition`
 * but throws on `start()`, leaving the UI stuck on "Listening"). For those
 * cases, knowing the browser family lets us short-circuit before the broken
 * call.
 *
 * SSR-safe: every helper checks for `window` first.
 */

/** True when the user is on iOS (iPhone / iPad / iPod) AND not Safari.
 *
 * Why this matters: every browser on iOS is forced to use WKWebView under the
 * hood, regardless of brand. Apple blocks `webkitSpeechRecognition` for
 * non-Safari browsers — Chrome (CriOS), Firefox (FxiOS), Edge (EdgiOS), and
 * others — but they still expose the constructor. Calling `start()` throws
 * synchronously, the watchdog can't escalate (no `onend` fires for something
 * that never started), and the UI gets stuck on "Listening" forever.
 *
 * Detection: the iOS browsers identify themselves via "CriOS" / "FxiOS" /
 * "EdgiOS" tokens in the UA. iPad on iOS 13+ defaults to a desktop UA, so
 * we also check for `Macintosh` + touch — but that's a Safari heuristic, not
 * a "non-Safari iOS" signal. iOS Chrome on iPad still includes "CriOS" so
 * the desktop-UA fallback doesn't matter for the bug we're fixing.
 */
export const isIOSNonSafari = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Must be iOS (iPhone / iPad / iPod). Skip the desktop-UA-on-iPad case —
  // that's only Safari today, and Safari isn't the bug.
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  if (!isIOS) return false;
  // Any of the non-Safari iOS browser tokens.
  return /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/.test(ua);
};
