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

describe("Home — party-mode picker (gated behind partyEnabled)", () => {
  it("does NOT render the picker when partyEnabled=false (v1 byte-identical)", () => {
    render(<Home bestToday={14} attemptsRemaining={3} onStart={() => {}} displayName="Alex" />);
    expect(screen.queryByTestId("mode-picker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mode-tab-party")).not.toBeInTheDocument();
  });

  it("v1 path keeps the original 'Name or team name' label (no party regression)", () => {
    render(<Home bestToday={null} attemptsRemaining={5} onStart={() => {}} />);
    // When the URL flag isn't set, the copy is byte-identical to v1: same label,
    // same placeholder. Existing users see zero change.
    const input = screen.getByLabelText("Name or team name") as HTMLInputElement;
    expect(input.placeholder).toContain("Alex, or The Smiths");
  });

  it("renders the picker with Solo + Party tabs when partyEnabled=true", () => {
    render(
      <Home
        bestToday={14}
        attemptsRemaining={3}
        onStart={() => {}}
        displayName="Alex"
        partyEnabled
        playMode="solo"
      />,
    );
    expect(screen.getByTestId("mode-picker")).toBeInTheDocument();
    expect(screen.getByTestId("mode-tab-solo")).toBeInTheDocument();
    expect(screen.getByTestId("mode-tab-party")).toBeInTheDocument();
  });

  it("aria-selected reflects the active mode", () => {
    render(
      <Home
        bestToday={14}
        attemptsRemaining={3}
        onStart={() => {}}
        displayName="Alex"
        partyEnabled
        playMode="party"
      />,
    );
    expect(screen.getByTestId("mode-tab-solo").getAttribute("aria-selected")).toBe("false");
    expect(screen.getByTestId("mode-tab-party").getAttribute("aria-selected")).toBe("true");
  });

  it("tapping a different tab calls onPlayModeChange", () => {
    const onPlayModeChange = vi.fn();
    render(
      <Home
        bestToday={14}
        attemptsRemaining={3}
        onStart={() => {}}
        displayName="Alex"
        partyEnabled
        playMode="solo"
        onPlayModeChange={onPlayModeChange}
      />,
    );
    fireEvent.click(screen.getByTestId("mode-tab-party"));
    expect(onPlayModeChange).toHaveBeenCalledWith("party");
  });

  it("first interaction with picker fires onPartyPickerSeen", () => {
    const onPartyPickerSeen = vi.fn();
    render(
      <Home
        bestToday={14}
        attemptsRemaining={3}
        onStart={() => {}}
        displayName="Alex"
        partyEnabled
        playMode="solo"
        partyPickerSeen={false}
        onPartyPickerSeen={onPartyPickerSeen}
      />,
    );
    fireEvent.click(screen.getByTestId("mode-tab-party"));
    expect(onPartyPickerSeen).toHaveBeenCalledTimes(1);
  });

  it("NEW pill shows on Party tab when partyPickerSeen=false", () => {
    render(
      <Home
        bestToday={14}
        attemptsRemaining={3}
        onStart={() => {}}
        displayName="Alex"
        partyEnabled
        playMode="solo"
        partyPickerSeen={false}
      />,
    );
    expect(screen.getByTestId("party-new-pill")).toBeInTheDocument();
  });

  it("NEW pill is hidden once partyPickerSeen=true", () => {
    render(
      <Home
        bestToday={14}
        attemptsRemaining={3}
        onStart={() => {}}
        displayName="Alex"
        partyEnabled
        playMode="solo"
        partyPickerSeen={true}
      />,
    );
    expect(screen.queryByTestId("party-new-pill")).not.toBeInTheDocument();
  });

  it("name-field label switches to 'Group name' in party mode (DD7)", () => {
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={() => {}}
        partyEnabled
        playMode="party"
      />,
    );
    expect(screen.getByText(/group name/i)).toBeInTheDocument();
    const input = screen.getByTestId("display-name-input") as HTMLInputElement;
    expect(input.placeholder).toContain("Smiths");
  });

  it("party mode with no group name set shows the input + disables Start (force capture)", () => {
    // Real production case: user has solo name "Alex" in localStorage. Page
    // computes activeName=null when in party mode (separate slot, empty), and
    // passes that null to Home as displayName. Result: input is open and
    // Start is gated until they enter a group name.
    const onStart = vi.fn();
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={onStart}
        partyEnabled
        playMode="party"
        displayName={null}
      />,
    );
    // Input is showing (not the "Playing as ..." summary)
    expect(screen.getByTestId("display-name-input")).toBeInTheDocument();
    expect(screen.queryByTestId("display-name-summary")).not.toBeInTheDocument();
    // Start is disabled until they enter a group name
    const startBtn = screen.getByTestId("start-button") as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true);
    // The hint copy is party-flavored (not "Add your name above to play scored.")
    expect(screen.getByTestId("name-required-hint").textContent).toContain("group");
  });

  it("party mode with a group name set shows summary + enables Start", () => {
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={() => {}}
        partyEnabled
        playMode="party"
        displayName="The Smiths"
      />,
    );
    expect(screen.getByTestId("display-name-summary").textContent).toContain("The Smiths");
    const startBtn = screen.getByTestId("start-button") as HTMLButtonElement;
    expect(startBtn.disabled).toBe(false);
  });

  it("mic permission banner shows in party mode when permission='unknown'", () => {
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={() => {}}
        partyEnabled
        playMode="party"
        displayName="The Smiths"
        micPermission="unknown"
      />,
    );
    expect(screen.getByTestId("mic-permission-banner")).toBeInTheDocument();
    expect(screen.getByTestId("mic-allow-button")).toBeInTheDocument();
  });

  it("mic permission banner is HIDDEN when permission='granted'", () => {
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={() => {}}
        partyEnabled
        playMode="party"
        displayName="The Smiths"
        micPermission="granted"
      />,
    );
    expect(screen.queryByTestId("mic-permission-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mic-denied-banner")).not.toBeInTheDocument();
  });

  it("denied banner replaces the request banner when permission='denied'", () => {
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={() => {}}
        partyEnabled
        playMode="party"
        displayName="The Smiths"
        micPermission="denied"
      />,
    );
    expect(screen.queryByTestId("mic-permission-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("mic-denied-banner").textContent).toContain("Voice off");
  });

  it("denied banner is hidden once dismissed", () => {
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={() => {}}
        partyEnabled
        playMode="party"
        displayName="The Smiths"
        micPermission="denied"
        micDeniedDismissed
      />,
    );
    expect(screen.queryByTestId("mic-denied-banner")).not.toBeInTheDocument();
  });

  it("Allow button calls onRequestMicPermission", () => {
    const onRequestMicPermission = vi.fn();
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={() => {}}
        partyEnabled
        playMode="party"
        displayName="The Smiths"
        micPermission="unknown"
        onRequestMicPermission={onRequestMicPermission}
      />,
    );
    fireEvent.click(screen.getByTestId("mic-allow-button"));
    expect(onRequestMicPermission).toHaveBeenCalledTimes(1);
  });

  it("permission banner does NOT render in Solo mode even with party enabled", () => {
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={() => {}}
        partyEnabled
        playMode="solo"
        displayName="Alex"
        micPermission="unknown"
      />,
    );
    expect(screen.queryByTestId("mic-permission-banner")).not.toBeInTheDocument();
  });

  it("voiceUnsupportedBrowser=true shows the Safari-needed banner instead of the mic permission banner", () => {
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={() => {}}
        partyEnabled
        playMode="party"
        displayName="The Smiths"
        micPermission="unknown"
        voiceUnsupportedBrowser
      />,
    );
    const banner = screen.getByTestId("voice-unsupported-banner");
    expect(banner.textContent).toMatch(/safari/i);
    // The mic-permission flow is suppressed (would lie on iOS Chrome)
    expect(screen.queryByTestId("mic-permission-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mic-allow-button")).not.toBeInTheDocument();
  });

  it("voiceUnsupportedBrowser=true also suppresses the denied banner", () => {
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={() => {}}
        partyEnabled
        playMode="party"
        displayName="The Smiths"
        micPermission="denied"
        voiceUnsupportedBrowser
      />,
    );
    expect(screen.queryByTestId("mic-denied-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("voice-unsupported-banner")).toBeInTheDocument();
  });

  it("voiceUnsupportedBrowser banner does NOT render in Solo mode", () => {
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={() => {}}
        partyEnabled
        playMode="solo"
        displayName="Alex"
        voiceUnsupportedBrowser
      />,
    );
    expect(screen.queryByTestId("voice-unsupported-banner")).not.toBeInTheDocument();
  });

  it("invite banner renders when inviteFromGroup + inviteScore are set", () => {
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={() => {}}
        partyEnabled
        playMode="party"
        displayName="My Crew"
        inviteFromGroup="The Smiths"
        inviteScore={22}
      />,
    );
    const banner = screen.getByTestId("invite-banner");
    expect(banner.textContent).toContain("The Smiths");
    expect(banner.textContent).toContain("22");
    expect(banner.textContent).toMatch(/beat them/i);
  });

  it("invite banner is HIDDEN when invite props are null (normal landing)", () => {
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={() => {}}
        partyEnabled
        playMode="party"
        displayName="My Crew"
      />,
    );
    expect(screen.queryByTestId("invite-banner")).not.toBeInTheDocument();
  });

  it("name-field label is 'Your name' in solo mode (DD7)", () => {
    render(
      <Home
        bestToday={null}
        attemptsRemaining={5}
        onStart={() => {}}
        partyEnabled
        playMode="solo"
      />,
    );
    // Use the label-association API to disambiguate from the "Add your name…" hint.
    const input = screen.getByLabelText("Your name") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.placeholder).toContain("Alex");
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
