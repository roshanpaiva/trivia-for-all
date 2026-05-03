import { describe, it, expect, vi, afterEach } from "vitest";
import { isIOSNonSafari } from "@/lib/browser";

const stubUA = (ua: string) => {
  vi.stubGlobal("navigator", { userAgent: ua });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isIOSNonSafari", () => {
  it("returns true for iOS Chrome (CriOS)", () => {
    stubUA(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1",
    );
    expect(isIOSNonSafari()).toBe(true);
  });

  it("returns true for iOS Firefox (FxiOS)", () => {
    stubUA(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15",
    );
    expect(isIOSNonSafari()).toBe(true);
  });

  it("returns true for iOS Edge (EdgiOS)", () => {
    stubUA(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/126.0.2592.61 Mobile/15E148 Safari/605.1.15",
    );
    expect(isIOSNonSafari()).toBe(true);
  });

  it("returns true on iPad Chrome", () => {
    stubUA(
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1",
    );
    expect(isIOSNonSafari()).toBe(true);
  });

  it("returns FALSE for iOS Safari (the supported browser)", () => {
    stubUA(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    );
    expect(isIOSNonSafari()).toBe(false);
  });

  it("returns FALSE for Android Chrome", () => {
    stubUA(
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36",
    );
    expect(isIOSNonSafari()).toBe(false);
  });

  it("returns FALSE for Desktop Chrome", () => {
    stubUA(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    );
    expect(isIOSNonSafari()).toBe(false);
  });

  it("returns FALSE in SSR (no navigator)", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isIOSNonSafari()).toBe(false);
  });
});
