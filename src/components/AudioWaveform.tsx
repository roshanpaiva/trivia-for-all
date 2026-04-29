/**
 * Brand mark: 5 vertical bars, animates when audio is active.
 * Per DESIGN.md → Iconography. Respects prefers-reduced-motion.
 */
type Props = {
  active?: boolean;
  className?: string;
};

export const AudioWaveform = ({ active = false, className = "" }: Props) => {
  return (
    <span
      className={`inline-flex items-end gap-[2px] h-4 ${className}`}
      aria-hidden="true"
    >
      {[7, 13, 16, 10, 14].map((h, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-[1px] ${active ? "bg-[var(--accent)]" : "bg-[var(--ink)]"} ${active ? "wave-bar" : ""}`}
          style={{
            height: `${h}px`,
            animationDelay: active ? `${i * 100}ms` : undefined,
          }}
        />
      ))}
      <style>{`
        @keyframes wave-pulse {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.6); }
        }
        .wave-bar {
          animation: wave-pulse 1.2s ease-in-out infinite;
          transform-origin: bottom;
        }
        @media (prefers-reduced-motion: reduce) {
          .wave-bar { animation: none; }
        }
      `}</style>
    </span>
  );
};
