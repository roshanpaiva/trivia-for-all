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

const SOLO_KEY = "tfa.displayName";
const PARTY_KEY = "quizzle.groupName";
export const MAX_LENGTH = 30;

const isBrowser = typeof window !== "undefined";

/** Trim, length-clamp, return null for empty. Mirrors server-side sanitizer. */
export const sanitize = (raw: string | null | undefined): string | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
};

const load = (key: string): string | null => {
  if (!isBrowser) return null;
  try {
    return sanitize(window.localStorage.getItem(key));
  } catch {
    // Private mode / quota / disabled — fall through to "not set".
    return null;
  }
};

const save = (key: string, raw: string | null): string | null => {
  const clean = sanitize(raw);
  if (!isBrowser) return clean;
  try {
    if (clean === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, clean);
    }
  } catch {
    // Best effort — UI still has the value via state, just won't persist.
  }
  return clean;
};

/** Solo display name. Used on the leaderboard's Today/All-time sections. */
export const loadDisplayName = (): string | null => load(SOLO_KEY);
export const saveDisplayName = (raw: string | null): string | null => save(SOLO_KEY, raw);

/** Party-mode group name. Stored in a separate slot so a user with a solo
 * name "Alex" still has to name their group when they switch to Party — no
 * carryover dilution. Per design DD7 (originally deferred to v2.1, brought
 * forward when real users hit the friction in production). */
export const loadGroupName = (): string | null => load(PARTY_KEY);
export const saveGroupName = (raw: string | null): string | null => save(PARTY_KEY, raw);
