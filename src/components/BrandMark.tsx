import { AudioWaveform } from "./AudioWaveform";

type Props = {
  audioActive?: boolean;
  className?: string;
};

/** "Quizzle" + waveform. Per DESIGN.md typography (display-m, 28px / 800). */
export const BrandMark = ({ audioActive = false, className = "" }: Props) => {
  return (
    <div
      className={`flex items-center gap-2.5 font-display font-extrabold text-[28px] leading-none tracking-tight ${className}`}
    >
      <span>
        Qu<span className="text-[var(--accent)]">izz</span>le
      </span>
      <AudioWaveform active={audioActive} className="h-6" />
    </div>
  );
};
