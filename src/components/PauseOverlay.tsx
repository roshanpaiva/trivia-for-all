/**
 * Pause overlay for hard network failure (D6 from /plan-design-review).
 * Shows during /api/answer auto-retry. After 10 retries the copy escalates.
 */

type Props = {
  retryCount?: number;
  maxRetries?: number;
  onRetryNow?: () => void;
};

export const PauseOverlay = ({ retryCount = 0, maxRetries = 10, onRetryNow }: Props) => {
  const exhausted = retryCount >= maxRetries;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="pause-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--canvas)]/95 backdrop-blur-sm p-6"
      data-testid="pause-overlay"
    >
      <div className="max-w-sm rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6 text-center">
        <h2 id="pause-title" className="font-display text-[22px] font-bold mb-2">
          {exhausted ? "We can't reach the server" : "Connection lost"}
        </h2>
        <p className="text-[var(--muted)] text-[14px] mb-4">
          {exhausted
            ? "Your progress is saved. Come back when you're online."
            : "Your score is safe. Auto-retrying every 3 seconds…"}
        </p>
        <button
          type="button"
          onClick={onRetryNow}
          className="w-full min-h-[56px] rounded-lg bg-[var(--ink)] text-[var(--canvas)] font-bold text-[18px] hover:opacity-85"
        >
          {exhausted ? "Try again" : "Retry now"}
        </button>
      </div>
    </div>
  );
};
