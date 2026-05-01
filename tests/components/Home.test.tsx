import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Home } from "@/components/Home";

describe("Home — variants", () => {
  it("first-time visitor: shows how-to-play in the slot, not best score", () => {
    render(
      <Home bestToday={null} attemptsRemaining={5} onStart={() => {}} />
    );
    expect(screen.getByTestId("how-to-play")).toBeInTheDocument();
    expect(screen.getByTestId("how-to-play").textContent).toContain("120s");
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

  it("Start tap calls onStart with mode='scored' (when a name is set)", () => {
    const onStart = vi.fn();
    render(<Home bestToday={null} attemptsRemaining={5} displayName="Alex" onStart={onStart} />);
    fireEvent.click(screen.getByTestId("start-button"));
    expect(onStart).toHaveBeenCalledWith("scored");
  });

  it("Start is disabled when no name is set (scored requires a name)", () => {
    const onStart = vi.fn();
    render(<Home bestToday={null} attemptsRemaining={5} onStart={onStart} />);
    const startBtn = screen.getByTestId("start-button") as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true);
    expect(screen.getByTestId("name-required-hint")).toBeInTheDocument();
    // Clicking the disabled button is a no-op
    fireEvent.click(startBtn);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("Practice tap calls onStart with mode='practice'", () => {
    const onStart = vi.fn();
    render(<Home bestToday={14} attemptsRemaining={2} onStart={onStart} />);
    fireEvent.click(screen.getByTestId("practice-secondary-cta"));
    expect(onStart).toHaveBeenCalledWith("practice");
  });

  it("0/5-used: secondary CTA is a leaderboard link, not a start button", () => {
    // Regression: previously this rendered as a button with onClick=handleStart,
    // so clicking "View leaderboard" actually started a practice game.
    const onStart = vi.fn();
    render(
      <Home
        bestToday={21}
        attemptsRemaining={0}
        onStart={onStart}
        msUntilReset={4 * 60 * 60 * 1000}
      />,
    );
    const secondary = screen.getByTestId("practice-secondary-cta");
    expect(secondary.tagName).toBe("A");
    expect(secondary.getAttribute("href")).toBe("/leaderboard");
    fireEvent.click(secondary);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("resumable attempt: button label changes to Resume", () => {
    render(
      <Home bestToday={14} attemptsRemaining={3} hasResumableAttempt onStart={() => {}} />
    );
    expect(screen.getByTestId("start-button").textContent).toContain("Resume");
  });
});

describe("Home — personal best (pride preserved across daily reset)", () => {
  it("renders 'Personal best: X' inline when personalBest is set", () => {
    render(
      <Home bestToday={14} personalBest={26} attemptsRemaining={3} onStart={() => {}} />,
    );
    const pb = screen.getByTestId("personal-best");
    expect(pb).toBeInTheDocument();
    expect(pb.textContent).toContain("Personal best:");
    expect(pb.textContent).toContain("26");
  });

  it("hides personal-best line when personalBest is null", () => {
    render(
      <Home bestToday={14} personalBest={null} attemptsRemaining={3} onStart={() => {}} />,
    );
    expect(screen.queryByTestId("personal-best")).not.toBeInTheDocument();
  });

  it("returning-next-day visitor (bestToday null but personalBest set) does NOT show how-to-play", () => {
    // The kid who got 26 yesterday opens the app this morning with fresh
    // attempts. attemptsRemaining=5 + bestToday=null used to mark him as
    // first-time. Personal best disambiguates.
    render(
      <Home bestToday={null} personalBest={26} attemptsRemaining={5} onStart={() => {}} />,
    );
    expect(screen.queryByTestId("how-to-play")).not.toBeInTheDocument();
    expect(screen.getByTestId("personal-best").textContent).toContain("26");
  });

  it("first-time visitor (no personalBest, no bestToday) still shows how-to-play", () => {
    render(<Home bestToday={null} personalBest={null} attemptsRemaining={5} onStart={() => {}} />);
    expect(screen.getByTestId("how-to-play")).toBeInTheDocument();
  });

  it("shows '—' for bestToday when player hasn't played today but has a personal best", () => {
    render(
      <Home bestToday={null} personalBest={26} attemptsRemaining={5} onStart={() => {}} />,
    );
    // Best today: — · Personal best: 26
    expect(screen.getByText(/best today/i).textContent).toContain("—");
    expect(screen.getByTestId("personal-best").textContent).toContain("26");
  });
});

describe("Home — name capture", () => {
  it("first-time visitor sees the name input", () => {
    render(<Home bestToday={null} attemptsRemaining={5} onStart={() => {}} />);
    expect(screen.getByTestId("display-name-input")).toBeInTheDocument();
    expect(screen.queryByTestId("display-name-summary")).not.toBeInTheDocument();
  });

  it("returning visitor with a name sees the 'Playing as <name> · Edit' summary", () => {
    render(
      <Home bestToday={14} attemptsRemaining={3} displayName="Alex" onStart={() => {}} />,
    );
    const summary = screen.getByTestId("display-name-summary");
    expect(summary.textContent).toContain("Alex");
    expect(screen.getByTestId("edit-name-button")).toBeInTheDocument();
    expect(screen.queryByTestId("display-name-input")).not.toBeInTheDocument();
  });

  it("clicking Edit reopens the input", () => {
    render(
      <Home bestToday={14} attemptsRemaining={3} displayName="Alex" onStart={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("edit-name-button"));
    expect(screen.getByTestId("display-name-input")).toBeInTheDocument();
  });

  it("typing + blurring calls onNameChange with the trimmed value", () => {
    const onNameChange = vi.fn();
    render(
      <Home bestToday={null} attemptsRemaining={5} onStart={() => {}} onNameChange={onNameChange} />,
    );
    const input = screen.getByTestId("display-name-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Alex  " } });
    fireEvent.blur(input);
    expect(onNameChange).toHaveBeenCalledWith("Alex");
  });

  it("Enter inside the input commits the name", () => {
    const onNameChange = vi.fn();
    render(
      <Home bestToday={null} attemptsRemaining={5} onStart={() => {}} onNameChange={onNameChange} />,
    );
    const input = screen.getByTestId("display-name-input");
    fireEvent.change(input, { target: { value: "Sam" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onNameChange).toHaveBeenCalledWith("Sam");
  });

  it("clicking Start saves a typed-but-uncommitted name first", () => {
    const onNameChange = vi.fn();
    const onStart = vi.fn();
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={onStart}
        onNameChange={onNameChange}
      />,
    );
    fireEvent.change(screen.getByTestId("display-name-input"), { target: { value: "Pat" } });
    fireEvent.click(screen.getByTestId("start-button"));
    expect(onNameChange).toHaveBeenCalledWith("Pat");
    expect(onStart).toHaveBeenCalledWith("scored");
  });
});
