"use client";

/**
 * Leaderboard view. Three explicit UI states per /plan-design-review Pass 2:
 *   - loading: skeleton rows
 *   - empty (Day 1, no scores): "Be the first today!"
 *   - error: "Leaderboard unavailable"
 *   - normal: top 100 + your rank pinned at the bottom (Krug rule)
 */

import { useEffect, useState } from "react";
import { getLeaderboard, type LeaderboardResponse } from "@/lib/api";
import { Attribution } from "./Attribution";

export const Leaderboard = () => {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    getLeaderboard()
      .then((res) => {
        setData(res);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <main
      className="flex min-h-screen flex-col px-5 py-6 bg-[var(--canvas)] text-[var(--ink)]"
      data-testid="leaderboard"
    >
      {/* Top nav — back is always visible above the fold */}
      <div className="flex items-center justify-between mb-4">
        <a
          href="/"
          className="inline-flex items-center gap-1 text-[14px] text-[var(--ink)] hover:text-[var(--accent)] transition-colors"
          data-testid="leaderboard-back"
        >
          ← Back
        </a>
        <span className="text-[14px] text-[var(--muted)]">
          {data?.dateUtc ?? ""} · UTC
        </span>
      </div>

      {/* Today section header */}
      <h1 className="font-display font-bold text-[28px] tracking-tight">Today</h1>
      <p className="text-[14px] text-[var(--muted)] mb-6">
        {status === "ok" && data
          ? `${data.totalPlayers} players · resets at midnight UTC`
          : "Loading…"}
      </p>

      {/* Today body */}
      {status === "loading" && <SkeletonRows />}

      {status === "error" && (
        <div className="text-center py-12" data-testid="leaderboard-error">
          <div className="font-display font-semibold text-[18px] mb-2">
            Leaderboard unavailable
          </div>
          <p className="text-[var(--muted)] text-[14px]">
            Your score is safely recorded. Refresh to retry.
          </p>
        </div>
      )}

      {status === "ok" && data && data.top.length === 0 && (
        <div className="text-center py-12" data-testid="leaderboard-empty">
          <div className="font-display font-semibold text-[18px] mb-2">
            Be the first today!
          </div>
          <p className="text-[var(--muted)] text-[14px]">
            Play a daily attempt and you'll be #1.
          </p>
        </div>
      )}

      {status === "ok" && data && data.top.length > 0 && (
        <div data-testid="leaderboard-rows">
          {data.top.map((row, i) => (
            <Row key={`${row.rank}-${row.handle}-${i}`} {...row} />
          ))}

          {/* Pin "you" at the bottom if outside top N (Krug rule) */}
          {data.yourRank !== null &&
            data.yourBestToday !== null &&
            data.yourRank > data.top.length && (
              <>
                <div className="text-center text-[var(--muted)] py-2">⋯</div>
                <Row
                  rank={data.yourRank}
                  handle={`you (best: ${data.yourBestToday})`}
                  bestScore={data.yourBestToday}
                  bestWrong={0}
                  isYou={true}
                />
              </>
            )}
        </div>
      )}

      {/* All-time top 10 — pride preserved across the daily reset. Same row
          component, same Krug-pin rule. Only renders when today's load is OK
          (we share one fetch). */}
      {status === "ok" && data && (
        <section data-testid="leaderboard-all-time" className="mt-10">
          <h2 className="font-display font-bold text-[22px] tracking-tight">All time</h2>
          <p className="text-[14px] text-[var(--muted)] mb-4">Top 10 highest scores ever.</p>

          {data.allTime.top.length === 0 ? (
            <div className="text-[var(--muted)] text-[14px] py-3" data-testid="leaderboard-all-time-empty">
              No scores yet. Be the first to land here.
            </div>
          ) : (
            <div data-testid="leaderboard-all-time-rows">
              {data.allTime.top.map((row, i) => (
                <Row key={`at-${row.rank}-${row.handle}-${i}`} {...row} />
              ))}

              {data.allTime.yourRank !== null &&
                data.yourPersonalBest !== null &&
                data.allTime.yourRank > data.allTime.top.length && (
                  <>
                    <div className="text-center text-[var(--muted)] py-2">⋯</div>
                    <Row
                      rank={data.allTime.yourRank}
                      handle={`you (best: ${data.yourPersonalBest})`}
                      bestScore={data.yourPersonalBest}
                      bestWrong={0}
                      isYou={true}
                    />
                  </>
                )}
            </div>
          )}
        </section>
      )}

      <div className="mt-auto pt-6">
        <Attribution />
      </div>
    </main>
  );
};

const SkeletonRows = () => (
  <div data-testid="leaderboard-skeleton">
    {[0, 1, 2, 3, 4].map((i) => (
      <div
        key={i}
        className="flex items-center gap-3 py-2.5 border-b border-[var(--line)] animate-pulse"
      >
        <div className="w-8 h-4 bg-[var(--surface)] rounded" />
        <div className="flex-1 h-4 bg-[var(--surface)] rounded" />
        <div className="w-8 h-4 bg-[var(--surface)] rounded" />
      </div>
    ))}
  </div>
);

const Row = ({
  rank,
  handle,
  bestScore,
  isYou,
}: {
  rank: number;
  handle: string;
  bestScore: number;
  bestWrong: number;
  isYou: boolean;
}) => (
  <div
    className={`grid grid-cols-[32px_1fr_auto] gap-3 items-center py-2.5 border-b border-[var(--line)] text-[16px] ${isYou ? "bg-[var(--accent-soft)] -mx-2 px-2 rounded-md" : ""}`}
    data-testid={isYou ? "leaderboard-you-row" : undefined}
  >
    <div className="font-bold text-[var(--muted)] tabular-nums">{rank}</div>
    <div className="font-medium">
      {handle}
      {isYou && <span className="ml-2 text-[12px] uppercase tracking-[0.12em] text-[var(--accent-strong)]">you</span>}
    </div>
    <div className="font-bold tabular-nums">{bestScore}</div>
  </div>
);
