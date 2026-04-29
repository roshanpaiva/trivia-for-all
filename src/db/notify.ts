/**
 * Notify-me email signup. Captures the v2 monetization launch list.
 *
 * On the 5/5-used screen, the user can drop their email; we store it with
 * their cookie + best-score-today so v2 launch emails can be personalized.
 *
 * GDPR: every signup gets an unsubscribe_token at insert time. v2 unsubscribe
 * endpoint will accept the token + soft-delete (set unsubscribed_at).
 */

import { getSql, type SqlTag } from "./client";

export type SignupResult =
  | { ok: true; isDuplicate: boolean }
  | { ok: false; reason: "invalid_email" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidEmail = (s: string): boolean =>
  EMAIL_RE.test(s) && s.length <= 254;

/**
 * Store a notify-me signup. Idempotent on email — duplicate signups update
 * the cookie + best-score-today + locale (refreshing the personalization
 * data) without inserting a new row.
 */
export const signupForNotify = async (params: {
  email: string;
  cookieId?: string | null;
  bestScoreToday?: number | null;
  locale?: string | null;
  sql?: SqlTag;
}): Promise<SignupResult> => {
  const sql = params.sql ?? getSql();
  const email = params.email.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { ok: false, reason: "invalid_email" };
  }

  const rows = await sql<{ inserted: boolean }>`
    INSERT INTO notify_signups (email, cookie_id, best_score_today, locale)
    VALUES (${email}, ${params.cookieId ?? null}, ${params.bestScoreToday ?? null}, ${params.locale ?? null})
    ON CONFLICT (email) DO UPDATE
      SET cookie_id        = COALESCE(EXCLUDED.cookie_id, notify_signups.cookie_id),
          best_score_today = COALESCE(EXCLUDED.best_score_today, notify_signups.best_score_today),
          locale           = COALESCE(EXCLUDED.locale, notify_signups.locale)
    RETURNING (xmax = 0) AS inserted
  `;

  return { ok: true, isDuplicate: !rows[0]?.inserted };
};
