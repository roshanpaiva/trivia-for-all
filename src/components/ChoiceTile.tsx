/**
 * Choice button. Per D7 from /plan-design-review, the button itself communicates
 * the in-game phase (no separate status text):
 *   reading    → faded in, dim, but tappable for barge-in
 *   answering  → fully visible + tappable
 *   validating → tapped one shows spinner; others dim
 *   reveal     → correct = green outline, wrong = red outline, others = dim
 */

import type { ReactNode } from "react";

export type ChoiceState = "reading" | "answering" | "validating-this" | "validating-other" | "reveal-correct" | "reveal-wrong" | "reveal-other";

type Props = {
  label: string;
  state: ChoiceState;
  onClick?: () => void;
  /** 1-based index for keyboard nav (1-4 keys). */
  shortcutKey?: number;
};

const stateStyles: Record<ChoiceState, string> = {
  reading: "border border-[var(--line)] bg-[var(--canvas)] opacity-50",
  answering: "border border-[var(--line)] bg-[var(--canvas)] hover:border-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ink)]",
  "validating-this": "border-2 border-[var(--ink)] bg-[var(--canvas)]",
  "validating-other": "border border-[var(--line)] bg-[var(--canvas)] opacity-30",
  "reveal-correct": "border-2 border-[var(--success)] bg-[#3a7d4414]",
  "reveal-wrong": "border border-dashed border-[var(--error)] bg-[#a33b2a14]",
  "reveal-other": "border border-[var(--line)] bg-[var(--canvas)] opacity-30",
};

const RevealMarker = ({ state }: { state: ChoiceState }): ReactNode => {
  if (state === "reveal-correct") return <span aria-hidden="true">✓</span>;
  if (state === "reveal-wrong") return <span aria-hidden="true">✗</span>;
  if (state === "validating-this") return (
    <span className="inline-block w-3 h-3 rounded-full border-2 border-[var(--ink)] border-t-transparent spin" aria-hidden="true">
      <style>{`
        @keyframes spin-anim { to { transform: rotate(360deg); } }
        .spin { animation: spin-anim 0.8s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
      `}</style>
    </span>
  );
  return null;
};

export const ChoiceTile = ({ label, state, onClick, shortcutKey }: Props) => {
  const tappable = state === "answering" || state === "reading";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!tappable}
      className={`flex w-full items-center justify-between text-left text-[18px] font-medium font-body min-h-[56px] px-5 py-4 rounded-lg mb-2 transition-colors duration-150 ${stateStyles[state]} ${tappable ? "cursor-pointer" : "cursor-default"}`}
      data-testid="choice-tile"
      data-state={state}
    >
      <span className="flex-1">{label}</span>
      {shortcutKey !== undefined && tappable && (
        <span className="ml-2 text-[var(--muted)] text-[12px] tabular-nums hidden md:inline" aria-hidden="true">
          {shortcutKey}
        </span>
      )}
      <RevealMarker state={state} />
    </button>
  );
};
