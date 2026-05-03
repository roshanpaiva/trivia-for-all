import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PostGame } from "@/components/PostGame";

const baseProps = {
  score: 22,
  wrongCount: 3,
  bestToday: 22,
  attemptsRemaining: 4,
  msUntilReset: 3_600_000,
  onPlayAgain: () => {},
  onPractice: () => {},
};

describe("PostGame — share button (DD12 v2 viral loop)", () => {
  beforeEach(() => { vi.unstubAllGlobals(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("does NOT render the share button in solo mode (default)", () => {
    render(<PostGame {...baseProps} />);
    expect(screen.queryByTestId("share-button")).not.toBeInTheDocument();
  });

  it("does NOT render the share button when playMode='party' but groupName is null", () => {
    render(<PostGame {...baseProps} playMode="party" groupName={null} />);
    expect(screen.queryByTestId("share-button")).not.toBeInTheDocument();
  });

  it("renders the share button when playMode='party' AND groupName is set", () => {
    render(<PostGame {...baseProps} playMode="party" groupName="The Smiths" />);
    const btn = screen.getByTestId("share-button");
    expect(btn.textContent).toContain("The Smiths");
    expect(btn.textContent).toContain("22");
  });

  it("tapping share calls navigator.share when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    render(<PostGame {...baseProps} playMode="party" groupName="The Smiths" />);
    fireEvent.click(screen.getByTestId("share-button"));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const arg = share.mock.calls[0][0];
    expect(arg.url).toContain("tryquizzle.com");
    expect(arg.url).toContain("group=The+Smiths");
    expect(arg.url).toContain("score=22");
  });

  it("shows 'Link copied' after the clipboard fallback fires", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } }); // no share method
    render(<PostGame {...baseProps} playMode="party" groupName="The Smiths" />);
    fireEvent.click(screen.getByTestId("share-button"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/link copied/i)).toBeInTheDocument();
  });
});
