import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Home } from "@/components/Home";

describe("Home — variants", () => {
  it("first-time visitor: shows how-to-play in the slot, not best score", () => {
    render(
      <Home bestToday={null} attemptsRemaining={5} onStart={() => {}} />
    );
    expect(screen.getByTestId("how-to-play")).toBeInTheDocument();
    expect(screen.getByTestId("how-to-play").textContent).toContain("90s");
  });

  it("returning user with attempts: shows best score + 'X of 5 attempts left' pill", () => {
    render(
      <Home bestToday={14} attemptsRemaining={3} onStart={() => {}} />
    );
    expect(screen.getByText(/best today/i)).toBeInTheDocument();
    expect(screen.getByTestId("attempts-pill").textContent).toContain("3 of 5");
  });

  it("0/5-used variant: swaps primary CTA to Practice + shows reset countdown", () => {
    render(
      <Home
        bestToday={21}
        attemptsRemaining={0}
        onStart={() => {}}
        msUntilReset={4 * 60 * 60 * 1000 + 14 * 60 * 1000}
      />
    );
    expect(screen.getByTestId("attempts-pill").textContent).toContain("All attempts used");
    expect(screen.getByTestId("practice-primary-cta")).toBeInTheDocument();
    expect(screen.queryByTestId("start-button")).not.toBeInTheDocument();
    expect(screen.getByText(/4h 14m/)).toBeInTheDocument();
  });

  it("Start tap calls onStart with mode='scored'", () => {
    const onStart = vi.fn();
    render(<Home bestToday={null} attemptsRemaining={5} onStart={onStart} />);
    fireEvent.click(screen.getByTestId("start-button"));
    expect(onStart).toHaveBeenCalledWith("scored");
  });

  it("Practice tap calls onStart with mode='practice'", () => {
    const onStart = vi.fn();
    render(<Home bestToday={14} attemptsRemaining={2} onStart={onStart} />);
    fireEvent.click(screen.getByTestId("practice-secondary-cta"));
    expect(onStart).toHaveBeenCalledWith("practice");
  });

  it("resumable attempt: button label changes to Resume", () => {
    render(
      <Home bestToday={14} attemptsRemaining={3} hasResumableAttempt onStart={() => {}} />
    );
    expect(screen.getByTestId("start-button").textContent).toContain("Resume");
  });
});
