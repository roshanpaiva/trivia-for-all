"""
Fetch ~300 candidate questions from Open Trivia DB across 6 categories.
Output: src/data/questions-raw.json (intermediate, before fact drafting).

Usage: python3 scripts/fetch-questions.py
"""
import json
import urllib.request
import base64
import time
import sys
import uuid
from pathlib import Path

# Categories from DESIGN.md / design doc. OTDB IDs.
CATEGORIES = [
    (9, "general"),
    (22, "geography"),
    (17, "science"),
    (23, "history"),
    (21, "sports"),
    (27, "random"),  # "Animals" used as proxy for random facts; can mix in others later
]

PER_CATEGORY = 50  # Max OTDB allows per call

DIFFICULTY_MAP = {"easy": "easy", "medium": "medium", "hard": "hard"}


def fetch_token():
    with urllib.request.urlopen(
        "https://opentdb.com/api_token.php?command=request", timeout=10
    ) as r:
        d = json.load(r)
    return d["token"]


def fetch_category(category_id, category_name, token, attempts=3):
    url = (
        f"https://opentdb.com/api.php"
        f"?amount={PER_CATEGORY}"
        f"&category={category_id}"
        f"&type=multiple"
        f"&encode=base64"
        f"&token={token}"
    )
    last_err = None
    for i in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=15) as r:
                d = json.load(r)
            if d["response_code"] == 0:
                return d["results"]
            elif d["response_code"] == 4:
                # Token exhausted for this category — reset
                print(f"  [{category_name}] token exhausted, resetting...")
                with urllib.request.urlopen(
                    f"https://opentdb.com/api_token.php?command=reset&token={token}",
                    timeout=10,
                ) as r:
                    json.load(r)
                continue
            elif d["response_code"] == 5:
                # Rate limit — sleep and retry
                print(f"  [{category_name}] rate limit, sleeping 5s...")
                time.sleep(5)
                continue
            else:
                last_err = f"OTDB returned response_code={d['response_code']}"
        except Exception as e:
            last_err = str(e)
            print(f"  [{category_name}] attempt {i+1} failed: {e}, retrying...")
            time.sleep(2)
    raise RuntimeError(f"Failed to fetch {category_name}: {last_err}")


def b64decode(s):
    return base64.b64decode(s).decode("utf-8")


def map_question(otdb, our_category):
    """Map an OTDB question to our schema."""
    prompt = b64decode(otdb["question"])
    correct = b64decode(otdb["correct_answer"])
    incorrect = [b64decode(x) for x in otdb["incorrect_answers"]]
    difficulty = b64decode(otdb["difficulty"])

    # OTDB returns 3 incorrect + 1 correct. Our schema needs exactly 4 choices.
    # Place the correct answer at a deterministic index based on a hash of the
    # prompt (so the same question always has the same correctIdx — easier to test
    # and verify, no shuffle randomness on every load).
    h = hash(prompt) % 4
    choices = list(incorrect)
    choices.insert(h, correct)
    correct_idx = h

    # ID: deterministic based on prompt hash so re-runs produce same IDs
    qid = f"{our_category}-{abs(hash(prompt)) % 10**8:08d}"

    return {
        "id": qid,
        "category": our_category,
        "difficulty": DIFFICULTY_MAP.get(difficulty, "medium"),
        "prompt": prompt,
        "choices": choices,
        "correctIdx": correct_idx,
        "fact": "",  # to be drafted in a follow-up pass
        "source": "opentdb",
    }


def main():
    print("Fetching session token...")
    token = fetch_token()
    print(f"Token: {token[:16]}...")

    all_questions = []
    seen_prompts = set()

    for cat_id, cat_name in CATEGORIES:
        print(f"\nFetching {cat_name} (OTDB id {cat_id})...")
        # Sleep 1s between categories to be a good citizen
        time.sleep(1)
        try:
            results = fetch_category(cat_id, cat_name, token)
        except RuntimeError as e:
            print(f"  ERROR: {e} — skipping category")
            continue

        kept = 0
        for r in results:
            try:
                q = map_question(r, cat_name)
            except Exception as e:
                print(f"  skip (mapping error): {e}")
                continue
            if q["prompt"] in seen_prompts:
                continue
            seen_prompts.add(q["prompt"])
            all_questions.append(q)
            kept += 1
        print(f"  kept {kept}/{len(results)}")

    out_path = Path("src/data/questions-raw.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "version": "0.1.1.0-raw",
                "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "source": "https://opentdb.com (CC BY-SA 4.0)",
                "total": len(all_questions),
                "categories": {c[1]: 0 for c in CATEGORIES},
                "questions": all_questions,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    # Backfill counts
    with out_path.open() as f:
        data = json.load(f)
    counts = {c[1]: 0 for c in CATEGORIES}
    for q in data["questions"]:
        counts[q["category"]] = counts.get(q["category"], 0) + 1
    data["categories"] = counts
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\nWrote {len(all_questions)} questions to {out_path}")
    print(f"Per category: {counts}")
    print(f"Difficulties: easy={sum(1 for q in all_questions if q['difficulty']=='easy')} "
          f"medium={sum(1 for q in all_questions if q['difficulty']=='medium')} "
          f"hard={sum(1 for q in all_questions if q['difficulty']=='hard')}")


if __name__ == "__main__":
    main()
