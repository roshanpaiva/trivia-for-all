import { AudioWaveform } from "./AudioWaveform";

type Props = {
  audioActive?: boolean;
  className?: string;
};

/** "Trivia·for·All" + waveform. Per DESIGN.md typography. */
export const BrandMark = ({ audioActive = false, className = "" }: Props) => {
  return (
    <div
      className={`flex items-center gap-2 font-display font-extrabold text-[18px] tracking-tight ${className}`}
    >
      <span>
        Trivia<span className="text-[var(--muted)]">·</span>for
        <span className="text-[var(--muted)]">·</span>All
      </span>
      <AudioWaveform active={audioActive} />
    </div>
  );
};
