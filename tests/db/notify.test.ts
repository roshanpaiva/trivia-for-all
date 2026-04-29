import { describe, it, expect } from "vitest";
import { signupForNotify } from "@/db/notify";
import { makeFakeSql } from "./_fakeSql";

describe("signupForNotify", () => {
  it("rejects invalid email format", async () => {
    const sql = makeFakeSql();
    const r = await signupForNotify({ email: "not-an-email", sql });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_email");
  });

  it("rejects empty email", async () => {
    const sql = makeFakeSql();
    const r = await signupForNotify({ email: "   ", sql });
    expect(r.ok).toBe(false);
  });

  it("rejects email with no domain", async () => {
    const sql = makeFakeSql();
    const r = await signupForNotify({ email: "foo@", sql });
    expect(r.ok).toBe(false);
  });

  it("rejects email > 254 chars", async () => {
    const longLocal = "a".repeat(250);
    const sql = makeFakeSql();
    const r = await signupForNotify({ email: `${longLocal}@example.com`, sql });
    expect(r.ok).toBe(false);
  });

  it("inserts and returns isDuplicate=false on first signup", async () => {
    const sql = makeFakeSql([
      { match: "INSERT INTO notify_signups", rows: [{ inserted: true }] },
    ]);
    const r = await signupForNotify({
      email: "Roshan@Example.com",
      cookieId: "c-1",
      bestScoreToday: 17,
      locale: "en-US",
      sql,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.isDuplicate).toBe(false);

    const insertCall = sql.__calls.find((c) => c.query.includes("INSERT INTO notify_signups"));
    // Email should be lowercased + trimmed before insert
    expect(insertCall?.params[0]).toBe("roshan@example.com");
  });

  it("returns isDuplicate=true on conflict (xmax != 0)", async () => {
    const sql = makeFakeSql([
      { match: "INSERT INTO notify_signups", rows: [{ inserted: false }] },
    ]);
    const r = await signupForNotify({ email: "exists@example.com", sql });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.isDuplicate).toBe(true);
  });

  it("uses ON CONFLICT DO UPDATE to refresh personalization fields", async () => {
    const sql = makeFakeSql([
      { match: "INSERT INTO notify_signups", rows: [{ inserted: false }] },
    ]);
    await signupForNotify({ email: "x@example.com", sql });
    const insertCall = sql.__calls.find((c) => c.query.includes("INSERT INTO notify_signups"));
    expect(insertCall?.query).toContain("ON CONFLICT (email) DO UPDATE");
    // COALESCE preserves existing values when new is null
    expect(insertCall?.query).toContain("COALESCE");
  });
});
