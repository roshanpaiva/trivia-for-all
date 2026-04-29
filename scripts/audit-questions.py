"""
Interactive auditor for trivia question candidates.

Reads src/data/questions-raw.json (unaudited OTDB candidates).
For each unaudited question, shows it and prompts:
  k = keep (then prompts for the fact)
  s = skip (drop entirely — wrong tone, kid-inappropriate, obscure)
  e = edit prompt or choices first, then keep
  ? = show why this question is in this category
  q = save and quit (resume later)

Writes accepted+facted questions to src/data/questions.json.
Re-run anytime — already-audited questions are skipped.

Usage:
  python3 scripts/audit-questions.py
  python3 scripts/audit-questions.py --target 200   # stop when 200 are kept
  python3 scripts/audit-questions.py --category geography  # filter
"""
import json
import sys
import argparse
from pathlib import Path

RAW_PATH = Path("src/data/questions-raw.json")
OUT_PATH = Path("src/data/questions.json")


def load_raw():
    with RAW_PATH.open() as f:
        return json.load(f)


def load_kept():
    if not OUT_PATH.exists():
        return {"version": "0.1.1.0", "questions": []}
    with OUT_PATH.open() as f:
        return json.load(f)


def save_kept(data):
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def show(q):
    print()
    print("=" * 68)
    print(f"[{q['category']}/{q['difficulty']}]  id={q['id']}")
    print()
    print(f"  Q: {q['prompt']}")
    print()
    for i, c in enumerate(q["choices"]):
        marker = "→" if i == q["correctIdx"] else " "
        print(f"   {marker} {chr(ord('A')+i)}) {c}")
    print()


def prompt_fact(answer):
    print(f"  Write a 1-sentence fact about: {answer!r}")
    print("  Aim: one short sentence, ~80-140 chars, interesting + verifiable.")
    print("  Examples of good facts:")
    print("    'The capital of Australia is Canberra, chosen as a compromise")
    print("     between rivals Sydney and Melbourne.'")
    print("    'Butterflies taste with their feet — chemoreceptors on their")
    print("     legs let them sample a leaf before laying eggs.'")
    fact = input("  fact> ").strip()
    return fact


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=200, help="Stop when N questions are kept")
    ap.add_argument("--category", type=str, default=None, help="Filter to one category")
    args = ap.parse_args()

    raw = load_raw()
    kept_data = load_kept()
    kept_ids = {q["id"] for q in kept_data["questions"]}

    print(f"Raw candidates: {raw['total']}")
    print(f"Already kept:   {len(kept_ids)}")
    print(f"Target:         {args.target}")
    print(f"Filter:         {args.category or 'all categories'}")

    candidates = [
        q for q in raw["questions"]
        if q["id"] not in kept_ids
        and (args.category is None or q["category"] == args.category)
    ]
    print(f"Remaining to audit: {len(candidates)}")
    print()
    print("Commands: k=keep, s=skip, e=edit-then-keep, q=save+quit")
    print()

    audited = 0
    for q in candidates:
        if len(kept_ids) >= args.target:
            print(f"\nReached target ({args.target}). Stopping.")
            break

        show(q)
        while True:
            choice = input("  [k/s/e/q] ").strip().lower()
            if choice in ("k", "s", "e", "q"):
                break

        if choice == "q":
            break

        if choice == "s":
            audited += 1
            continue

        if choice == "e":
            print("  Edit the prompt (or press Enter to keep current):")
            new_prompt = input(f"  prompt> [{q['prompt']}] ").strip()
            if new_prompt:
                q["prompt"] = new_prompt

        # Keep — get fact
        answer = q["choices"][q["correctIdx"]]
        fact = prompt_fact(answer)
        q["fact"] = fact
        kept_data["questions"].append(q)
        kept_ids.add(q["id"])
        audited += 1

        # Save after every keep so progress survives crashes
        save_kept(kept_data)

    print(f"\nAudited {audited} candidates. Total kept: {len(kept_data['questions'])}/{args.target}.")
    print(f"Saved to {OUT_PATH}")


if __name__ == "__main__":
    main()
