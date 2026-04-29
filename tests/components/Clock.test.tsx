import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Clock } from "@/components/Clock";

describe("Clock", () => {
  it("formats 90,000 ms as 1:30", () => {
    render(<Clock ms={90_000} />);
    expect(screen.getByTestId("clock-display").textContent).toBe("1:30");
  });

  it("pads single-digit seconds", () => {
    render(<Clock ms={5_000} />);
    expect(screen.getByTestId("clock-display").textContent).toBe("0:05");
  });

  it("rounds up partial seconds (UX: never shows '0:00' until truly done)", () => {
    render(<Clock ms={500} />);
    expect(screen.getByTestId("clock-display").textContent).toBe("0:01");
  });

  it("shows 0:00 at 0 ms exactly", () => {
    render(<Clock ms={0} />);
    expect(screen.getByTestId("clock-display").textContent).toBe("0:00");
  });

  it("clamps negative ms to 0:00 (defensive)", () => {
    render(<Clock ms={-100} />);
    expect(screen.getByTestId("clock-display").textContent).toBe("0:00");
  });

  it("renders the bonus rise number when bonusJustAdded is set", () => {
    render(<Clock ms={90_000} bonusJustAdded={10_000} />);
    expect(screen.getByTestId("bonus-rise").textContent).toContain("+10s");
  });

  it("doesn't render bonus rise when bonusJustAdded is 0", () => {
    render(<Clock ms={90_000} />);
    expect(screen.queryByTestId("bonus-rise")).not.toBeInTheDocument();
  });

  it("aria-label announces time remaining", () => {
    render(<Clock ms={75_000} />);
    expect(screen.getByLabelText("Time remaining: 1:15")).toBeInTheDocument();
  });
});
