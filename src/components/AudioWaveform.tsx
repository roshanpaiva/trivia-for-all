/**
 * Brand mark: 5 vertical bars. Doubles as the audio surface for both
 * output (TTS reading) and input (STT listening) per DD2 from
 * /plan-design-review — "audio waveform IS the brand visual; one component
 * for both halves of the audio loop, never on screen at the same time."
 *
 * Five states (DD4):
 *   - "off"                 bars static in --ink (default; no audio)
 *   - "tts-reading"         bars vary height per syllable in --accent (v1 behavior)
 *   - "mic-listening"       uniform-height bars pulse opacity 100% → 60% in --ink
 *   - "mic-still-listening" uniform-height bars pulse opacity 80% → 40% (slower; signals fade)
 *   - "mic-degraded"        bars static in --muted (voice off; tap-only)
 *
 * The legacy `active` prop is kept for backward compat — true = "tts-reading",
 * false = "off". Existing call sites in BrandMark + InGame don't change.
 *
 * Reduced-motion: all animations disabled per DESIGN.md a11y baseline.
 */

export type WaveformState =
  | "off"
  | "tts-reading"
  | "mic-listening"
  | "mic-still-listening"
  | "mic-degraded";

type Props = {
  /** Legacy: true = "tts-reading", false = "off". Kept so existing call sites
   * in BrandMark + InGame don't churn during the v2 rollout. New code should
   * prefer the `state` prop. */
  active?: boolean;
  /** Explicit state. Takes precedence over `active` when provided. */
  state?: WaveformState;
  className?: string;
};

const resolveState = (state: WaveformState | undefined, active: boolean): WaveformState => {
  if (state) return state;
  return active ? "tts-reading" : "off";
};

// Uniform bars are the visual differentiator for mic states — TTS varies
// per-bar so it reads as "speaking", mic flatlines so it reads as "listening".
const BAR_HEIGHTS_TTS = [44, 81, 100, 63, 88];
const BAR_HEIGHTS_MIC = [100, 100, 100, 100, 100];

const isMicState = (s: WaveformState): boolean =>
  s === "mic-listening" || s === "mic-still-listening" || s === "mic-degraded";

export const AudioWaveform = ({ active = false, state, className = "" }: Props) => {
  const resolved = resolveState(state, active);

  const barColor =
    resolved === "tts-reading"
      ? "bg-[var(--accent)]"
      : resolved === "mic-degraded"
        ? "bg-[var(--muted)]"
        : "bg-[var(--ink)]";

  const animClass =
    resolved === "tts-reading"
      ? "wave-bar-tts"
      : resolved === "mic-listening"
        ? "wave-bar-listen"
        : resolved === "mic-still-listening"
          ? "wave-bar-listen-slow"
          : "";

  const heights = isMicState(resolved) ? BAR_HEIGHTS_MIC : BAR_HEIGHTS_TTS;

  return (
    <span
      className={`inline-flex items-end gap-[2px] h-4 ${className}`}
      aria-hidden="true"
      data-state={resolved}
    >
      {heights.map((pct, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-[1px] ${barColor} ${animClass}`}
          style={{
            height: `${pct}%`,
            animationDelay: animClass ? `${i * 100}ms` : undefined,
          }}
        />
      ))}
      <style>{`
        @keyframes wave-pulse-tts {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.6); }
        }
        @keyframes wave-pulse-listen {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes wave-pulse-listen-slow {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 0.4; }
        }
        .wave-bar-tts {
          animation: wave-pulse-tts 1.2s ease-in-out infinite;
          transform-origin: bottom;
        }
        .wave-bar-listen {
          animation: wave-pulse-listen 0.9s ease-in-out infinite;
        }
        .wave-bar-listen-slow {
          animation: wave-pulse-listen-slow 1.8s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .wave-bar-tts, .wave-bar-listen, .wave-bar-listen-slow { animation: none; }
        }
      `}</style>
    </span>
  );
};
