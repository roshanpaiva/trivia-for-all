/**
 * Cookie-based anonymous identity.
 *
 * v1 trust model (acknowledged in the design doc): cookie-cleanable. A user
 * who clears cookies gets a fresh 5/day budget. v2 introduces real auth
 * alongside monetization, which closes this hole. For family-scale v1, the
 * audience isn't adversarial.
 *
 * Server-only — calls Next.js cookies() which is server-only.
 */

import { cookies } from "next/headers";

export const COOKIE_NAME = "tfa_id";
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365; // 1 year

/**
 * Read or mint a cookie identity. The first call from a new visitor mints a
 * UUID v4 and writes it; subsequent calls read it.
 *
 * Note: Next.js cookies() returns a ReadonlyRequestCookies in server components,
 * but a mutable cookies() bag inside route handlers. We rely on the route handler
 * context here.
 */
export const getOrMintCookieId = async (): Promise<string> => {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing && existing.length > 0) return existing;

  const minted = crypto.randomUUID();
  store.set({
    name: COOKIE_NAME,
    value: minted,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_S,
    path: "/",
  });
  return minted;
};

/**
 * Read the cookie identity without minting. Returns null if absent.
 * Use when the route can serve unauthenticated requests (e.g., GET /api/leaderboard).
 */
export const readCookieId = async (): Promise<string | null> => {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
};

/**
 * UTC date string for the leaderboard / daily-limit bookkeeping.
 * Format: YYYY-MM-DD. Always UTC per the design doc decision.
 */
export const todayUtc = (now: Date = new Date()): string => {
  return now.toISOString().slice(0, 10);
};
