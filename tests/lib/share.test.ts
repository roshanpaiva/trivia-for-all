import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildShareUrl, buildShareText, parseInviteParams, shareResult } from "@/lib/share";

describe("buildShareUrl", () => {
  it("produces an absolute URL with the right query params", () => {
    const url = buildShareUrl("The Smiths", 22);
    expect(url).toMatch(/^https:\/\/tryquizzle\.com\/\?/);
    expect(url).toContain("party=1");
    expect(url).toContain("ref=share");
    expect(url).toContain("group=The+Smiths");
    expect(url).toContain("score=22");
  });

  it("URL-encodes group names with special chars", () => {
    const url = buildShareUrl("Crew & Co.", 10);
    // URLSearchParams encodes & as %26, space as +
    expect(url).toContain("group=Crew+%26+Co.");
  });

  it("clamps negative or fractional scores", () => {
    expect(buildShareUrl("X", -5)).toContain("score=0");
    expect(buildShareUrl("X", 17.9)).toContain("score=17");
  });
});

describe("buildShareText", () => {
  it("produces a hook + URL-able payload", () => {
    expect(buildShareText("The Smiths", 22)).toBe("We got 22 as The Smiths on Quizzle. Beat us:");
  });
});

describe("parseInviteParams", () => {
  it("returns null when ref is not 'share'", () => {
    expect(parseInviteParams("?group=X&score=5")).toBeNull();
    expect(parseInviteParams("?ref=other&group=X&score=5")).toBeNull();
  });

  it("returns null when group is missing or empty", () => {
    expect(parseInviteParams("?ref=share&score=5")).toBeNull();
    expect(parseInviteParams("?ref=share&group=&score=5")).toBeNull();
    expect(parseInviteParams("?ref=share&group=%20%20&score=5")).toBeNull();
  });

  it("returns null when score is missing or non-numeric", () => {
    expect(parseInviteParams("?ref=share&group=X")).toBeNull();
    expect(parseInviteParams("?ref=share&group=X&score=abc")).toBeNull();
  });

  it("returns null when score is negative or implausibly large", () => {
    expect(parseInviteParams("?ref=share&group=X&score=-1")).toBeNull();
    expect(parseInviteParams("?ref=share&group=X&score=99999")).toBeNull();
  });

  it("returns the invite when all params are valid", () => {
    expect(parseInviteParams("?party=1&ref=share&group=The+Smiths&score=22"))
      .toEqual({ group: "The Smiths", score: 22 });
  });

  it("clamps group name to 30 chars (defensive)", () => {
    const long = "x".repeat(50);
    const inv = parseInviteParams(`?ref=share&group=${long}&score=10`);
    expect(inv?.group).toHaveLength(30);
  });
});

describe("shareResult", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses navigator.share when available and returns method='native'", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    const r = await shareResult({ group: "The Smiths", score: 22 });
    expect(r).toEqual({ ok: true, method: "native" });
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0];
    expect(arg.url).toContain("tryquizzle.com");
    expect(arg.text).toContain("The Smiths");
  });

  it("returns cancelled (ok=false) when navigator.share rejects with AbortError", async () => {
    const err = Object.assign(new Error("user cancelled"), { name: "AbortError" });
    const share = vi.fn().mockRejectedValue(err);
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });
    const r = await shareResult({ group: "X", score: 1 });
    expect(r).toEqual({ ok: false, reason: "cancelled" });
    expect(writeText).not.toHaveBeenCalled(); // no clipboard fallback for explicit cancel
  });

  it("falls back to clipboard when navigator.share rejects with a non-Abort error", async () => {
    const share = vi.fn().mockRejectedValue(new Error("blocked"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });
    const r = await shareResult({ group: "X", score: 1 });
    expect(r).toEqual({ ok: true, method: "clipboard" });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("tryquizzle.com");
  });

  it("uses clipboard when navigator.share is missing entirely (desktop Firefox-style)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const r = await shareResult({ group: "X", score: 1 });
    expect(r).toEqual({ ok: true, method: "clipboard" });
  });

  it("returns unsupported when neither share nor clipboard is available", async () => {
    vi.stubGlobal("navigator", {});
    const r = await shareResult({ group: "X", score: 1 });
    expect(r).toEqual({ ok: false, reason: "unsupported" });
  });
});
