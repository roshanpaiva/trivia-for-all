import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StreakDots } from "@/components/StreakDots";

describe("StreakDots", () => {
  it("streak 0 → 5 empty dots", () => {
    const { container } = render(<StreakDots streak={0} />);
    const dots = container.querySelectorAll("span.w-2");
    expect(dots).toHaveLength(5);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "No streak yet");
  });

  it("streak 3 → 3 filled, 2 empty (chasing 5)", () => {
    const { container } = render(<StreakDots streak={3} />);
    const filled = container.querySelectorAll("span.w-2.bg-\\[var\\(--accent\\)\\]");
    expect(filled).toHaveLength(3);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("2 to bonus") as unknown as string,
    );
  });

  it("streak 5 → 0 filled new tier (chasing 10)", () => {
    const { container } = render(<StreakDots streak={5} />);
    const dots = container.querySelectorAll("span.w-2");
    expect(dots).toHaveLength(5);
    expect(screen.getByRole("status").getAttribute("aria-label")).toContain("bonus active");
  });

  it("streak 7 → 2 filled in the new tier", () => {
    const { container } = render(<StreakDots streak={7} />);
    const filled = container.querySelectorAll("span.w-2.bg-\\[var\\(--accent\\)\\]");
    expect(filled).toHaveLength(2);
  });

  it("streak >= 10 → all 10 dots filled", () => {
    const { container } = render(<StreakDots streak={12} />);
    const dots = container.querySelectorAll("span.w-2");
    expect(dots).toHaveLength(10);
    const filled = container.querySelectorAll("span.w-2.bg-\\[var\\(--accent\\)\\]");
    expect(filled).toHaveLength(10);
  });
});
