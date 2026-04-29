import { AudioWaveform } from "./AudioWaveform";

type Props = {
  audioActive?: boolean;
  className?: string;
};

/** "Quizzle" + waveform. Per DESIGN.md typography. */
export const BrandMark = ({ audioActive = false, className = "" }: Props) => {
  return (
    <div
      className={`flex items-center gap-2 font-display font-extrabold text-[18px] tracking-tight ${className}`}
    >
      <span>
        Qu<span className="text-[var(--accent)]">izz</span>le
      </span>
      <AudioWaveform active={audioActive} />
    </div>
  );
};
