/**
 * Share-result helpers for the v2 viral loop (DD12 — originally deferred to
 * v2.1 in /plan-design-review, brought forward once party mode landed).
 *
 * Goal: the cheapest way to find more party-mode players is for the existing
 * party-mode players to send the link to friends. After a party game, the
 * user taps Share, native share sheet opens, they fire it to a group chat,
 * recipients tap the link, land on Home with a banner showing the inviter's
 * group + score, and party mode is pre-selected.
 *
 * Pure helpers — no React, no DOM beyond `navigator.share` / `clipboard`.
 */

const ABSOLUTE_BASE = "https://tryquizzle.com";

/** Build the deep-link URL for a party-mode share. The `?party=1` flag turns
 * the soft-launch picker on for the recipient; `ref=share` lets us attribute
 * referral traffic in the future; `group` + `score` populate the invite
 * banner on Home. */
export const buildShareUrl = (group: string, score: number): string => {
  const params = new URLSearchParams({
    party: "1",
    ref: "share",
    group,
    score: String(Math.max(0, Math.floor(score))),
  });
  return `${ABSOLUTE_BASE}/?${params.toString()}`;
};

/** Standard share text. Kept short — the URL itself is the payload, the
 * preview text is just the hook. */
export const buildShareText = (group: string, score: number): string =>
  `We got ${score} as ${group} on Quizzle. Beat us:`;

export type ShareResult =
  | { ok: true; method: "native" | "clipboard" }
  | { ok: false; reason: "cancelled" | "unsupported" };

/** Share via navigator.share when available, fall back to clipboard.
 * Returns the outcome so the caller can show a one-shot confirmation
 * ("Copied!") on the clipboard path. */
export const shareResult = async (params: {
  group: string;
  score: number;
}): Promise<ShareResult> => {
  const url = buildShareUrl(params.group, params.score);
  const text = buildShareText(params.group, params.score);

  // Native share sheet — iOS Safari, Android Chrome, recent desktops.
  // Must be called inside a user gesture (caller handles that).
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Quizzle", text, url });
      return { ok: true, method: "native" };
    } catch (e) {
      // AbortError = user cancelled the sheet. Anything else = real failure;
      // fall through to clipboard so they at least get the link.
      if (e instanceof Error && e.name === "AbortError") {
        return { ok: false, reason: "cancelled" };
      }
    }
  }

  // Clipboard fallback. Compose text + URL together so the paste contains
  // both the hook and the link.
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      return { ok: true, method: "clipboard" };
    } catch {
      // Clipboard blocked (perms / not focused).
    }
  }

  return { ok: false, reason: "unsupported" };
};

/** Read invite params from a URL search string. Returns null when ref!=share
 * or required params are missing/invalid. Defensive parsing — anyone can
 * forge the URL, so we sanitize aggressively. */
export const parseInviteParams = (
  search: string,
): { group: string; score: number } | null => {
  let params: URLSearchParams;
  try { params = new URLSearchParams(search); } catch { return null; }
  if (params.get("ref") !== "share") return null;
  const group = (params.get("group") ?? "").trim().slice(0, 30);
  const scoreRaw = params.get("score");
  const score = scoreRaw === null ? NaN : parseInt(scoreRaw, 10);
  if (!group || !Number.isFinite(score) || score < 0 || score > 1000) return null;
  return { group, score };
};
