/**
 * POST /api/attempt/[attemptId]/stt-degrade
 *
 * Telemetry-only endpoint. Called by useStt's onDegrade callback when the
 * watchdog escalates to "degraded" — usually once per attempt if it happens
 * at all (party mode + voice answering only).
 *
 * Increments attempts.stt_degrade_count for the row. We verify the cookie
 * matches the attempt's owner so a curious user can't bump someone else's
 * count, but otherwise the call is fire-and-forget (no body, no response
 * payload of substance).
 *
 * Idempotent in the soft sense: each call increments by 1. The watchdog
 * fires at most once per recognition cycle, so under normal usage you'd
 * see counts of 0 (no degrade) or 1 (degraded once mid-attempt). Higher
 * counts would suggest the consumer is over-reporting — worth investigating
 * but not a security issue.
 */

import { NextResponse } from "next/server";
import { findAttempt, incrementSttDegradeCount } from "@/db/attempts";
import { readCookieId } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await ctx.params;
  if (!attemptId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const cookieId = await readCookieId();
  if (!cookieId) {
    return NextResponse.json({ error: "no_cookie" }, { status: 401 });
  }

  const attempt = await findAttempt(attemptId);
  if (!attempt) {
    return NextResponse.json({ error: "attempt_not_found" }, { status: 404 });
  }
  if (attempt.cookieId !== cookieId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await incrementSttDegradeCount(attemptId, cookieId);

  return NextResponse.json({ ok: true });
}
