"""
clean_dataset.py
----------------
Reads the raw dataset produced by dataset_generator.py (analytics.json),
fixes any invalid values, and saves the result as cleaned_analytics.json.

What it fixes:
  - viewer_count outside 1-10  -> clamped to a value in 1-10
  - male + female != viewer_count -> redistributed to match
  - engagement outside 0-100   -> replaced with a default in 60-80

Run with:
    python clean_dataset.py
    python clean_dataset.py --input analytics.json --output cleaned_analytics.json
"""

import json
import argparse
from validation import validate_and_clean

# ── Default file paths ─────────────────────────────────────────────────────────
DEFAULT_INPUT  = "analytics.json"
DEFAULT_OUTPUT = "cleaned_analytics.json"


def clean_dataset(input_path: str, output_path: str):

    # ── Step 1: Load the raw JSON file ────────────────────────────────────────
    print(f"\nReading  : {input_path}")
    try:
        with open(input_path, "r", encoding="utf-8") as f:
            records = json.load(f)
    except FileNotFoundError:
        print(f"[ERROR] File '{input_path}' not found.")
        print("        Run dataset_generator.py first to create it.")
        return
    except json.JSONDecodeError as e:
        print(f"[ERROR] Could not parse JSON: {e}")
        return

    total          = len(records)
    corrections    = 0
    cleaned        = []

    print(f"Records  : {total}")
    print("-" * 50)

    # ── Step 2: Clean each record ─────────────────────────────────────────────
    for i, record in enumerate(records, start=1):
        image_name = record.get("image_name", f"record_{i}")
        print(f"\n[{i}/{total}] {image_name}")

        raw = {
            "viewer_count": record.get("viewer_count", 0),
            "male":         record.get("male",         0),
            "female":       record.get("female",       0),
            "engagement":   record.get("engagement",   0),
        }

        cleaned_data = validate_and_clean(raw, label=image_name)

        # Check if anything actually changed
        changed = (
            raw["viewer_count"] != cleaned_data["viewer_count"] or
            raw["male"]         != cleaned_data["male"]         or
            raw["female"]       != cleaned_data["female"]       or
            raw["engagement"]   != cleaned_data["engagement"]
        )
        if changed:
            corrections += 1
        else:
            print(f"  [OK] No corrections needed.")

        # Build the cleaned record (keep inference_time_s if it exists)
        cleaned_record = {
            "image_name":   image_name,
            "viewer_count": cleaned_data["viewer_count"],
            "male":         cleaned_data["male"],
            "female":       cleaned_data["female"],
            "engagement":   cleaned_data["engagement"],
        }
        if "inference_time_s" in record:
            cleaned_record["inference_time_s"] = record["inference_time_s"]

        cleaned.append(cleaned_record)

    # ── Step 3: Save cleaned JSON ─────────────────────────────────────────────
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2)

    # ── Step 4: Print summary ─────────────────────────────────────────────────
    print("\n" + "=" * 50)
    print("CLEANING COMPLETE")
    print("=" * 50)
    print(f"  Total records     : {total}")
    print(f"  Records corrected : {corrections}")
    print(f"  Records already OK: {total - corrections}")
    print(f"  Saved to          : {output_path}")
    print("=" * 50)


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clean raw Qwen inference dataset.")
    parser.add_argument("--input",  default=DEFAULT_INPUT,  help="Raw JSON file to read")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="Cleaned JSON file to write")
    args = parser.parse_args()

    clean_dataset(args.input, args.output)
