import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AudioWaveform } from "@/components/AudioWaveform";

const root = (el: HTMLElement) => el.querySelector("[data-state]") as HTMLElement;
const bars = (el: HTMLElement) => Array.from(root(el).querySelectorAll("span")) as HTMLElement[];

describe("AudioWaveform — legacy `active` prop (backward compat)", () => {
  it("active=false → state='off' (ink, no animation, varied heights)", () => {
    const { container } = render(<AudioWaveform active={false} />);
    expect(root(container).getAttribute("data-state")).toBe("off");
    const b = bars(container);
    expect(b[0].className).toContain("bg-[var(--ink)]");
    expect(b[0].className).not.toContain("wave-bar-");
    // Varied heights (the iconic v1 look)
    expect(b[0].style.height).toBe("44%");
    expect(b[2].style.height).toBe("100%");
  });

  it("active=true → state='tts-reading' (accent, wave animation, varied heights)", () => {
    const { container } = render(<AudioWaveform active={true} />);
    expect(root(container).getAttribute("data-state")).toBe("tts-reading");
    const b = bars(container);
    expect(b[0].className).toContain("bg-[var(--accent)]");
    expect(b[0].className).toContain("wave-bar-tts");
    expect(b[0].style.height).toBe("44%");
  });

  it("default (no props) → state='off'", () => {
    const { container } = render(<AudioWaveform />);
    expect(root(container).getAttribute("data-state")).toBe("off");
  });
});

describe("AudioWaveform — explicit `state` prop", () => {
  it("state='mic-listening' → ink uniform bars with fast pulse", () => {
    const { container } = render(<AudioWaveform state="mic-listening" />);
    expect(root(container).getAttribute("data-state")).toBe("mic-listening");
    const b = bars(container);
    expect(b[0].className).toContain("bg-[var(--ink)]");
    expect(b[0].className).toContain("wave-bar-listen");
    // All bars uniform — visual differentiator from "wavy" TTS look
    expect(b.map((bar) => bar.style.height)).toEqual(["100%", "100%", "100%", "100%", "100%"]);
  });

  it("state='mic-still-listening' → ink uniform bars with slow pulse", () => {
    const { container } = render(<AudioWaveform state="mic-still-listening" />);
    expect(root(container).getAttribute("data-state")).toBe("mic-still-listening");
    const b = bars(container);
    expect(b[0].className).toContain("bg-[var(--ink)]");
    expect(b[0].className).toContain("wave-bar-listen-slow");
    expect(b.every((bar) => bar.style.height === "100%")).toBe(true);
  });

  it("state='mic-degraded' → muted static uniform bars (voice off, no animation)", () => {
    const { container } = render(<AudioWaveform state="mic-degraded" />);
    expect(root(container).getAttribute("data-state")).toBe("mic-degraded");
    const b = bars(container);
    expect(b[0].className).toContain("bg-[var(--muted)]");
    // No animation class — degraded is intentionally inert
    expect(b[0].className).not.toContain("wave-bar-");
    expect(b.every((bar) => bar.style.height === "100%")).toBe(true);
  });

  it("state='off' (explicit) matches legacy active=false", () => {
    const { container } = render(<AudioWaveform state="off" />);
    expect(root(container).getAttribute("data-state")).toBe("off");
    const b = bars(container);
    expect(b[0].className).toContain("bg-[var(--ink)]");
    expect(b[0].style.height).toBe("44%");
  });

  it("state='tts-reading' (explicit) matches legacy active=true", () => {
    const { container } = render(<AudioWaveform state="tts-reading" />);
    expect(root(container).getAttribute("data-state")).toBe("tts-reading");
    const b = bars(container);
    expect(b[0].className).toContain("bg-[var(--accent)]");
    expect(b[0].className).toContain("wave-bar-tts");
  });
});

describe("AudioWaveform — state precedence", () => {
  it("`state` prop overrides `active` when both are provided", () => {
    // active=true would say "tts-reading", but explicit state wins.
    const { container } = render(<AudioWaveform active={true} state="mic-listening" />);
    expect(root(container).getAttribute("data-state")).toBe("mic-listening");
  });

  it("active=true with state='off' → off (state wins)", () => {
    const { container } = render(<AudioWaveform active={true} state="off" />);
    expect(root(container).getAttribute("data-state")).toBe("off");
  });
});

describe("AudioWaveform — accessibility + className", () => {
  it("has aria-hidden so screen readers skip the visual flourish", () => {
    const { container } = render(<AudioWaveform state="mic-listening" />);
    expect(root(container).getAttribute("aria-hidden")).toBe("true");
  });

  it("className prop is appended to the container", () => {
    const { container } = render(<AudioWaveform state="off" className="h-6 ml-2" />);
    expect(root(container).className).toContain("h-6");
    expect(root(container).className).toContain("ml-2");
  });

  it("animation delay is staggered across bars in animated states", () => {
    const { container } = render(<AudioWaveform state="mic-listening" />);
    const b = bars(container);
    // 5 bars, 100ms stagger each
    expect(b[0].style.animationDelay).toBe("0ms");
    expect(b[2].style.animationDelay).toBe("200ms");
    expect(b[4].style.animationDelay).toBe("400ms");
  });

  it("no animation delay in static states", () => {
    const { container } = render(<AudioWaveform state="off" />);
    const b = bars(container);
    expect(b[0].style.animationDelay).toBe("");
  });
});
