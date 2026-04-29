/**
 * Player-supplied display name persistence — localStorage on the client.
 *
 * Why localStorage and not a cookie:
 *   - The cookie carries the anonymous identity (cookie_id). Adding a name
 *     cookie means the name travels on every request, which is wasteful AND
 *     forces server-side trust of an unauthenticated client value.
 *   - localStorage keeps the name client-only; the server only sees it when
 *     we explicitly send it (in finalize), and it's always re-validated
 *     server-side via sanitizeDisplayName.
 *
 * The same constraints as the server (trim, 30 char cap, empty → null) apply
 * here so what you see locally matches what shows up on the leaderboard.
 */

const KEY = "tfa.displayName";
export const MAX_LENGTH = 30;

const isBrowser = typeof window !== "undefined";

/** Trim, length-clamp, return null for empty. Mirrors server-side sanitizer. */
export const sanitize = (raw: string | null | undefined): string | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
};

export const loadDisplayName = (): string | null => {
  if (!isBrowser) return null;
  try {
    return sanitize(window.localStorage.getItem(KEY));
  } catch {
    // Private mode / quota / disabled — fall through to "not set".
    return null;
  }
};

export const saveDisplayName = (raw: string | null): string | null => {
  const clean = sanitize(raw);
  if (!isBrowser) return clean;
  try {
    if (clean === null) {
      window.localStorage.removeItem(KEY);
    } else {
      window.localStorage.setItem(KEY, clean);
    }
  } catch {
    // Best effort — UI still has the value via state, just won't persist.
  }
  return clean;
};
