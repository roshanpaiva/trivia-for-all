"use client";

/**
 * Top-level game page. Owns the Home / InGame / PostGame switch based on
 * useGame's status + state.phase.
 *
 * Loads bestToday + attemptsRemaining from the leaderboard endpoint on mount;
 * polls for an in-progress attempt for resume-after-reload.
 */

import { useEffect, useState } from "react";
import { Home } from "@/components/Home";
import { InGame } from "@/components/InGame";
import { PostGame } from "@/components/PostGame";
import { useGame } from "@/hooks/useGame";
import { useAudio } from "@/hooks/useAudio";
import { getLeaderboard, getCurrentAttempt } from "@/lib/api";
import { loadDisplayName, saveDisplayName, loadGroupName, saveGroupName } from "@/lib/displayName";
import type { AttemptMode, PlayMode } from "@/lib/types";

/** Soft-launch flag for party mode. Set with `?party=1` in the URL. Persists
 * for the session in localStorage so a returning visitor in the same browser
 * doesn't lose access. v2.1 will flip the default. */
const PARTY_ENABLED_KEY = "quizzle.partyEnabled";
const PARTY_PICKER_SEEN_KEY = "quizzle.partyPickerSeen";

const readPartyEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  // URL flag wins on the current paint and writes through to localStorage.
  if (window.location.search.includes("party=1")) {
    try { window.localStorage.setItem(PARTY_ENABLED_KEY, "1"); } catch {}
    return true;
  }
  try { return window.localStorage.getItem(PARTY_ENABLED_KEY) === "1"; } catch { return false; }
};

const readPartyPickerSeen = (): boolean => {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(PARTY_PICKER_SEEN_KEY) === "1"; } catch { return false; }
};

const msUntilNextUtcMidnight = (now: Date = new Date()): number => {
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return tomorrow.getTime() - now.getTime();
};

export default function GamePage() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  // v2 party-mode soft-launch state. All default false on SSR; hydrated from
  // window in the mount effect to avoid an SSR/CSR text mismatch.
  const [partyEnabled, setPartyEnabled] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>("solo");
  const [partyPickerSeen, setPartyPickerSeen] = useState(false);

  // The "active" name is the one that lands on the leaderboard for the next
  // attempt. Solo and party have separate slots so a user with solo name
  // "Alex" still has to pick a group name when they switch to Party.
  const activeName = playMode === "party" ? groupName : displayName;

  const game = useGame({ displayName: activeName });
  const audio = useAudio();
  const [bestToday, setBestToday] = useState<number | null>(null);
  const [personalBest, setPersonalBest] = useState<number | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number>(5);
  const [hasResumable, setHasResumable] = useState(false);

  // Hydrate names + party-mode flags from localStorage on mount (client-only).
  useEffect(() => {
    setDisplayName(loadDisplayName());
    setGroupName(loadGroupName());
    setPartyEnabled(readPartyEnabled());
    setPartyPickerSeen(readPartyPickerSeen());
  }, []);

  const handlePartyPickerSeen = () => {
    setPartyPickerSeen(true);
    try { window.localStorage.setItem(PARTY_PICKER_SEEN_KEY, "1"); } catch {}
  };

  // Initial load: best score + remaining attempts + resumable attempt
  useEffect(() => {
    Promise.all([getLeaderboard(), getCurrentAttempt()])
      .then(([lb, current]) => {
        setBestToday(lb.yourBestToday);
        setPersonalBest(lb.yourPersonalBest);
        setAttemptsRemaining(lb.yourAttemptsRemaining);
        if (current.status === "in_progress") {
          setHasResumable(true);
        }
      })
      .catch(() => {
        // Silent; user lands on first-time home variant
      });
  }, []);

  const handleNameChange = (raw: string | null) => {
    // Routes the write to the slot matching the active mode. Switching modes
    // never overwrites the other slot — solo "Alex" stays "Alex" even after
    // the user names a party group.
    if (playMode === "party") {
      const cleaned = saveGroupName(raw);
      setGroupName(cleaned);
    } else {
      const cleaned = saveDisplayName(raw);
      setDisplayName(cleaned);
    }
  };

  // After finalize, refresh best + remaining. Personal best updates if this
  // attempt cracked it — the kid who just got 27 sees "Personal best: 27" on
  // Home immediately, no leaderboard reload required.
  useEffect(() => {
    if (game.status === "finalized" && game.finalScore) {
      setAttemptsRemaining(game.finalScore.attemptsRemaining);
      if (game.finalScore.score > (bestToday ?? 0)) {
        setBestToday(game.finalScore.score);
      }
      if (game.finalScore.score > (personalBest ?? 0)) {
        setPersonalBest(game.finalScore.score);
      }
    }
  }, [game.status, game.finalScore, bestToday, personalBest]);

  const handleStart = (mode: AttemptMode) => {
    game.startGame(mode, playMode);
  };

  // ===== Render switch =====

  if (game.status === "playing" && game.attempt) {
    const q = game.attempt.questions[game.state.questionIdx];
    if (!q) return null;
    return (
      <InGame
        state={game.state}
        question={q}
        questionNumber={game.state.questionIdx + 1}
        totalQuestions={game.attempt.questions.length}
        audioActive={audio.state === "speaking"}
        isRecovering={game.isRecovering}
        onTapChoice={game.tapChoice}
        onFinishReading={game.finishReading}
        onFinishReveal={game.finishReveal}
      />
    );
  }

  // Finalize is a brief server roundtrip. Render a quiet loading shell instead
  // of falling through to Home, which would flash the name input + Start CTA.
  if (game.status === "finalizing") {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center mx-auto max-w-[420px] px-5 py-6 bg-[var(--canvas)] text-[var(--ink)]"
        data-testid="finalizing"
      >
        <div className="font-display text-[20px] text-[var(--muted)]" role="status" aria-live="polite">
          Saving your score…
        </div>
      </main>
    );
  }

  if (game.status === "finalized" && game.finalScore) {
    return (
      <PostGame
        score={game.finalScore.score}
        wrongCount={game.finalScore.wrongCount}
        bestToday={bestToday ?? game.finalScore.score}
        attemptsRemaining={game.finalScore.attemptsRemaining}
        msUntilReset={msUntilNextUtcMidnight()}
        endReason={game.state.endReason}
        onPlayAgain={() => window.location.reload()}
        onPractice={() => window.location.reload()}
      />
    );
  }

  const friendlyError =
    game.error === "daily_limit_reached"
      ? "You've used all 5 attempts today. Try practice mode below."
      : game.error;

  return (
    <Home
      bestToday={bestToday}
      personalBest={personalBest}
      attemptsRemaining={attemptsRemaining}
      onStart={handleStart}
      hasResumableAttempt={hasResumable}
      msUntilReset={attemptsRemaining === 0 ? msUntilNextUtcMidnight() : undefined}
      errorMessage={friendlyError}
      isStarting={game.status === "starting"}
      displayName={activeName}
      onNameChange={handleNameChange}
      partyEnabled={partyEnabled}
      playMode={playMode}
      onPlayModeChange={setPlayMode}
      partyPickerSeen={partyPickerSeen}
      onPartyPickerSeen={handlePartyPickerSeen}
    />
  );
}
