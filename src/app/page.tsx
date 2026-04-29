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
import { loadDisplayName, saveDisplayName } from "@/lib/displayName";
import type { AttemptMode } from "@/lib/types";

const msUntilNextUtcMidnight = (now: Date = new Date()): number => {
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return tomorrow.getTime() - now.getTime();
};

export default function GamePage() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const game = useGame({ displayName });
  const audio = useAudio();
  const [bestToday, setBestToday] = useState<number | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number>(5);
  const [hasResumable, setHasResumable] = useState(false);

  // Hydrate display name from localStorage on mount (client-only).
  useEffect(() => {
    setDisplayName(loadDisplayName());
  }, []);

  // Initial load: best score + resumable attempt
  useEffect(() => {
    Promise.all([getLeaderboard(), getCurrentAttempt()])
      .then(([lb, current]) => {
        setBestToday(lb.yourBestToday);
        if (current.status === "in_progress") {
          setHasResumable(true);
        }
      })
      .catch(() => {
        // Silent; user lands on first-time home variant
      });
  }, []);

  const handleNameChange = (raw: string | null) => {
    const cleaned = saveDisplayName(raw);
    setDisplayName(cleaned);
  };

  // After finalize, refresh best + remaining
  useEffect(() => {
    if (game.status === "finalized" && game.finalScore) {
      setAttemptsRemaining(game.finalScore.attemptsRemaining);
      if (game.finalScore.score > (bestToday ?? 0)) {
        setBestToday(game.finalScore.score);
      }
    }
  }, [game.status, game.finalScore, bestToday]);

  const handleStart = (mode: AttemptMode) => {
    game.startGame(mode);
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

  if (game.status === "finalized" && game.finalScore) {
    return (
      <PostGame
        score={game.finalScore.score}
        wrongCount={game.finalScore.wrongCount}
        bestToday={bestToday ?? game.finalScore.score}
        attemptsRemaining={game.finalScore.attemptsRemaining}
        msUntilReset={msUntilNextUtcMidnight()}
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
      attemptsRemaining={attemptsRemaining}
      onStart={handleStart}
      hasResumableAttempt={hasResumable}
      msUntilReset={attemptsRemaining === 0 ? msUntilNextUtcMidnight() : undefined}
      errorMessage={friendlyError}
      isStarting={game.status === "starting"}
      displayName={displayName}
      onNameChange={handleNameChange}
    />
  );
}
