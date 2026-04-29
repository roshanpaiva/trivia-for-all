/**
 * POST /api/notify { email, locale? }
 *
 * Captures the v2 monetization launch list. Stores email + cookie + best-score-today
 * + locale (for personalization later).
 *
 * GDPR-friendly: every signup gets an unsubscribe_token at insert time.
 * Idempotent on email — duplicate signups refresh the personalization fields.
 */

import { NextResponse } from "next/server";
import { signupForNotify } from "@/db/notify";
import { getLeaderboard } from "@/db/scores";
import { readCookieId, todayUtc } from "@/lib/identity";

export const dynamic = "force-dynamic";

type Body = { email?: string; locale?: string };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (typeof body.email !== "string" || body.email.trim().length === 0) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  const cookieId = await readCookieId();
  const dateUtc = todayUtc();

  // Best effort: include the user's best score today for v2 personalization.
  let bestScoreToday: number | null = null;
  if (cookieId) {
    const lb = await getLeaderboard({ dateUtc, cookieId, limit: 1 });
    bestScoreToday = lb.yourBestToday;
  }

  const result = await signupForNotify({
    email: body.email,
    cookieId,
    bestScoreToday,
    locale: body.locale ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  return NextResponse.json({ ok: true, isDuplicate: result.isDuplicate });
}
