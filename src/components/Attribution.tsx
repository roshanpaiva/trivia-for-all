/**
 * Tiny attribution + license line. Shown in the footer of every public page
 * (Home, PostGame, Leaderboard) per the CC BY-SA 4.0 terms of the Open Trivia
 * DB content that seeds the question bank.
 *
 * Full license text: LICENSE-CONTENT.md at repo root.
 */
export const Attribution = ({ className = "" }: { className?: string }) => (
  <p className={`text-[12px] text-[var(--muted)] ${className}`}>
    Questions from{" "}
    <a
      href="https://opentdb.com/"
      target="_blank"
      rel="noopener noreferrer"
      className="underline hover:text-[var(--ink)]"
    >
      Open Trivia DB
    </a>{" "}
    ·{" "}
    <a
      href="https://creativecommons.org/licenses/by-sa/4.0/"
      target="_blank"
      rel="noopener noreferrer"
      className="underline hover:text-[var(--ink)]"
    >
      CC BY-SA 4.0
    </a>
  </p>
);
