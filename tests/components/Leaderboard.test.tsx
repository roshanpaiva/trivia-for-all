import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Leaderboard } from "@/components/Leaderboard";

vi.mock("@/lib/api", () => ({
  getLeaderboard: vi.fn(),
}));

import { getLeaderboard } from "@/lib/api";
const mockedGetLeaderboard = vi.mocked(getLeaderboard);

const baseResponse = {
  top: [
    { rank: 1, handle: "Pat", isYou: false, bestScore: 22, bestWrong: 1 },
    { rank: 2, handle: "Sam", isYou: false, bestScore: 19, bestWrong: 2 },
  ],
  yourRank: null,
  yourBestToday: null,
  yourPersonalBest: null,
  yourAttemptsRemaining: 5,
  totalPlayers: 2,
  dateUtc: "2026-04-30",
  allTime: {
    top: [
      { rank: 1, handle: "Pat", isYou: false, bestScore: 27, bestWrong: 0 },
      { rank: 2, handle: "Sam", isYou: false, bestScore: 26, bestWrong: 1 },
      { rank: 3, handle: "Alex", isYou: false, bestScore: 25, bestWrong: 1 },
    ],
    yourRank: null,
  },
  // Empty party section — Lane D will render this, but Lane B's component
  // ignores the field, so empty arrays here just satisfy the response type.
  party: {
    today: { top: [], yourRank: null, yourBestToday: null, totalPlayers: 0 },
    allTime: { top: [], yourRank: null, yourPersonalBest: null },
  },
};

describe("Leaderboard — All-time section", () => {
  beforeEach(() => {
    mockedGetLeaderboard.mockReset();
  });

  it("renders the All-time top section with rows after load", async () => {
    mockedGetLeaderboard.mockResolvedValueOnce(baseResponse);
    render(<Leaderboard />);
    await waitFor(() => {
      expect(screen.getByTestId("leaderboard-all-time")).toBeInTheDocument();
    });
    const rows = screen.getByTestId("leaderboard-all-time-rows");
    expect(rows.textContent).toContain("Pat");
    expect(rows.textContent).toContain("27");
    expect(rows.textContent).toContain("Alex");
    expect(screen.getByText(/all time/i)).toBeInTheDocument();
  });

  it("renders empty-state copy when no all-time scores yet", async () => {
    mockedGetLeaderboard.mockResolvedValueOnce({
      ...baseResponse,
      allTime: { top: [], yourRank: null },
    });
    render(<Leaderboard />);
    await waitFor(() => {
      expect(screen.getByTestId("leaderboard-all-time-empty")).toBeInTheDocument();
    });
  });

  it("krug-pins 'you' in the all-time section when outside top 10", async () => {
    // Pat got 14 once, currently rank 47 all-time. Should pin at the bottom.
    mockedGetLeaderboard.mockResolvedValueOnce({
      ...baseResponse,
      yourPersonalBest: 14,
      allTime: {
        top: baseResponse.allTime.top, // 3 rows
        yourRank: 47,
      },
    });
    render(<Leaderboard />);
    await waitFor(() => {
      expect(screen.getByTestId("leaderboard-all-time-rows")).toBeInTheDocument();
    });
    // The "you" row appears with the personal best score
    const youRows = screen.getAllByTestId("leaderboard-you-row");
    // One in today's section if applicable, one in all-time. We just need at
    // least one with bestScore=14 (the personal best pinned in all-time).
    expect(youRows.some((r) => r.textContent?.includes("14"))).toBe(true);
    expect(youRows.some((r) => r.textContent?.includes("47"))).toBe(true);
  });

  it("does NOT pin 'you' in all-time when caller is already in the top", async () => {
    mockedGetLeaderboard.mockResolvedValueOnce({
      ...baseResponse,
      yourPersonalBest: 27,
      allTime: {
        top: [
          { rank: 1, handle: "Pat", isYou: true, bestScore: 27, bestWrong: 0 },
          { rank: 2, handle: "Sam", isYou: false, bestScore: 26, bestWrong: 1 },
        ],
        yourRank: 1,
      },
    });
    render(<Leaderboard />);
    await waitFor(() => {
      expect(screen.getByTestId("leaderboard-all-time-rows")).toBeInTheDocument();
    });
    // No krug ellipsis row in all-time section
    const allTimeSection = screen.getByTestId("leaderboard-all-time");
    expect(allTimeSection.textContent).not.toContain("⋯");
  });

  it("hides All-time section while loading", () => {
    // Don't resolve yet — component should render skeleton, not all-time.
    mockedGetLeaderboard.mockReturnValueOnce(new Promise(() => {}));
    render(<Leaderboard />);
    expect(screen.queryByTestId("leaderboard-all-time")).not.toBeInTheDocument();
    expect(screen.getByTestId("leaderboard-skeleton")).toBeInTheDocument();
  });
});
