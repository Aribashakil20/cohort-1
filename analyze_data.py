"""
analyze_data.py
---------------
Reads cleaned_analytics.json and prints a clear summary of the dataset.

What it calculates:
  - Total images processed
  - Total and average viewers
  - Total male and female counts
  - Male / female percentage split
  - Average engagement score
  - Highest and lowest engagement images

Run with:
    python analyze_data.py
    python analyze_data.py --input cleaned_analytics.json
"""

import json
import argparse

DEFAULT_INPUT = "cleaned_analytics.json"


def analyze(input_path: str):

    # ── Step 1: Load cleaned JSON ─────────────────────────────────────────────
    print(f"\nReading: {input_path}")
    try:
        with open(input_path, "r", encoding="utf-8") as f:
            records = json.load(f)
    except FileNotFoundError:
        print(f"[ERROR] File '{input_path}' not found.")
        print("        Run clean_dataset.py first to create it.")
        return
    except json.JSONDecodeError as e:
        print(f"[ERROR] Could not parse JSON: {e}")
        return

    total = len(records)
    if total == 0:
        print("[ERROR] File is empty. No records to analyze.")
        return

    # ── Step 2: Calculate stats ───────────────────────────────────────────────
    total_viewers    = sum(r["viewer_count"] for r in records)
    total_male       = sum(r["male"]         for r in records)
    total_female     = sum(r["female"]       for r in records)
    total_engagement = sum(r["engagement"]   for r in records)

    avg_viewers    = round(total_viewers    / total, 2)
    avg_engagement = round(total_engagement / total, 2)

    male_pct   = round((total_male   / total_viewers * 100), 1) if total_viewers > 0 else 0
    female_pct = round((total_female / total_viewers * 100), 1) if total_viewers > 0 else 0

    # Image with highest and lowest engagement
    best  = max(records, key=lambda r: r["engagement"])
    worst = min(records, key=lambda r: r["engagement"])

    # ── Step 3: Print results ─────────────────────────────────────────────────
    print("\n" + "=" * 50)
    print("  SMART AUDIENCE ANALYTICS — SUMMARY")
    print("=" * 50)

    print(f"\n  DATASET")
    print(f"  -------")
    print(f"  Total images analysed : {total}")

    print(f"\n  VIEWERS")
    print(f"  -------")
    print(f"  Total viewers         : {total_viewers}")
    print(f"  Average per image     : {avg_viewers}")

    print(f"\n  GENDER SPLIT")
    print(f"  ------------")
    print(f"  Total male            : {total_male}  ({male_pct}%)")
    print(f"  Total female          : {total_female}  ({female_pct}%)")

    print(f"\n  ENGAGEMENT")
    print(f"  ----------")
    print(f"  Average engagement    : {avg_engagement}%")
    print(f"  Highest engagement    : {best['engagement']}%  ({best['image_name']})")
    print(f"  Lowest  engagement    : {worst['engagement']}%  ({worst['image_name']})")

    print(f"\n  PER-IMAGE BREAKDOWN")
    print(f"  -------------------")
    print(f"  {'Image':<30} {'Viewers':>7} {'Male':>6} {'Female':>7} {'Engagement':>11}")
    print(f"  {'-'*30} {'-'*7} {'-'*6} {'-'*7} {'-'*11}")
    for r in records:
        print(f"  {r['image_name']:<30} {r['viewer_count']:>7} "
              f"{r['male']:>6} {r['female']:>7} {r['engagement']:>10}%")

    print("\n" + "=" * 50)


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Analyze cleaned audience analytics dataset.")
    parser.add_argument("--input", default=DEFAULT_INPUT, help="Cleaned JSON file to read")
    args = parser.parse_args()

    analyze(args.input)
