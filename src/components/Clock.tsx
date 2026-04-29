/**
 * Big mm:ss clock display. Tabular numerals so digits don't shift width.
 */

type Props = {
  ms: number;
  bonusJustAdded?: number; // for the +10s / +15s flying number animation
  className?: string;
};

const formatMmSs = (ms: number): string => {
  const totalS = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const Clock = ({ ms, bonusJustAdded = 0, className = "" }: Props) => {
  return (
    <div className={`relative text-center ${className}`}>
      <div
        className="font-display font-extrabold text-[64px] leading-none tracking-tighter tabular-nums"
        data-testid="clock-display"
        aria-live="polite"
        aria-label={`Time remaining: ${formatMmSs(ms)}`}
      >
        {formatMmSs(ms)}
      </div>
      <div className="text-[var(--muted)] text-[12px] uppercase tracking-[0.12em] mt-1">
        Time left
      </div>
      {bonusJustAdded > 0 && (
        <span
          className="absolute -top-2 right-12 text-[24px] font-extrabold text-[var(--accent)] bonus-rise"
          data-testid="bonus-rise"
          aria-hidden="true"
        >
          +{Math.round(bonusJustAdded / 1000)}s ↑
        </span>
      )}
      <style>{`
        @keyframes bonus-rise-anim {
          0%   { opacity: 0; transform: translateY(0); }
          20%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-24px); }
        }
        .bonus-rise {
          animation: bonus-rise-anim 600ms ease-out forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .bonus-rise { animation: none; opacity: 1; }
        }
      `}</style>
    </div>
  );
};
