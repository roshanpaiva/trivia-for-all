/**
 * Segmented streak progress dots (D4 from /plan-design-review).
 * Shows progress toward the next bonus threshold (5 or 10 in a row).
 */

type Props = {
  streak: number;
  className?: string;
};

export const StreakDots = ({ streak, className = "" }: Props) => {
  // Determine which threshold we're chasing.
  // streak 0..4 → chasing 5 (5 dots)
  // streak 5..9 → chasing 10 (5 more dots)
  // streak >= 10 → bonus active, all 10 filled
  let target = 5;
  let filledOfTarget = streak;
  if (streak >= 5 && streak < 10) {
    target = 5;
    filledOfTarget = streak - 5;
  } else if (streak >= 10) {
    target = 10;
    filledOfTarget = 10;
  }

  const dots = Array.from({ length: target }, (_, i) => i < filledOfTarget);

  const label =
    streak >= 10
      ? "Streak 10+ — bonus active"
      : streak >= 5
        ? `Streak ${streak} — bonus active, ${10 - streak} to next tier`
        : streak > 0
          ? `Streak ${streak} — ${5 - streak} to bonus`
          : "No streak yet";

  return (
    <div
      className={`inline-flex items-center gap-1 ${className}`}
      role="status"
      aria-label={label}
      data-testid="streak-dots"
    >
      {dots.map((filled, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full transition-colors duration-200 ${
            filled ? "bg-[var(--accent)]" : "bg-[var(--line)]"
          }`}
        />
      ))}
    </div>
  );
};
