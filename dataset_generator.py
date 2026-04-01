"""
dataset_generator.py
--------------------
Runs Qwen2-VL inference on every image in a folder and saves
results to CSV and JSON, plus prints a summary at the end.

Usage:
    python dataset_generator.py
    python dataset_generator.py --folder my_images --csv out.csv --json out.json
"""

import os
import csv
import json
import time
import argparse
from pathlib import Path

# ── Reuse the already-loaded Qwen model from qwen_inference.py ────────────────
# The model loads ONCE here (takes ~20-30s), then we call qwen_inference()
# for every image without reloading.
from qwen_inference import qwen_inference
from validation import validate_and_clean

import cv2  # used to read images into OpenCV format (same as main.py expects)

# ── Supported image extensions ────────────────────────────────────────────────
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# ── Delay between inferences (seconds) — give CPU breathing room ──────────────
DELAY_BETWEEN_IMAGES = 2


def get_image_paths(folder: str) -> list:
    """Return sorted list of image file paths inside `folder`."""
    folder_path = Path(folder)
    if not folder_path.exists():
        print(f"[ERROR] Folder '{folder}' not found.")
        print(f"        Create it and add images, then run again.")
        return []

    paths = sorted([
        p for p in folder_path.iterdir()
        if p.suffix.lower() in IMAGE_EXTENSIONS
    ])
    return paths


def read_image(image_path: Path):
    """
    Read an image file and return an OpenCV BGR numpy array.
    Returns None if the file cannot be read.
    """
    img = cv2.imread(str(image_path))
    if img is None:
        print(f"  [WARN] Could not read '{image_path.name}' — skipping.")
    return img


def process_images(folder: str, csv_path: str, json_path: str):
    """Main loop: iterate images, run inference, save results."""

    image_paths = get_image_paths(folder)

    if not image_paths:
        print("No images found. Nothing to process.")
        return

    total = len(image_paths)
    print(f"\nFound {total} image(s) in '{folder}'")
    print(f"Results → CSV : {csv_path}")
    print(f"          JSON: {json_path}")
    print("-" * 50)

    results      = []   # list of dicts — written to JSON at end
    total_start  = time.time()

    # Open CSV and write header immediately so file exists even if we crash mid-run
    with open(csv_path, "w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=["image_name", "viewer_count", "male", "female", "engagement", "inference_time_s"]
        )
        writer.writeheader()

        for idx, image_path in enumerate(image_paths, start=1):
            print(f"\n[{idx}/{total}] Processing: {image_path.name}")

            # Read image
            frame = read_image(image_path)
            if frame is None:
                row = {
                    "image_name":       image_path.name,
                    "viewer_count":     0,
                    "male":             0,
                    "female":           0,
                    "engagement":       0,
                    "inference_time_s": 0.0,
                }
                writer.writerow(row)
                csv_file.flush()
                results.append(row)
                continue

            # Run inference and time it
            t_start = time.time()
            data    = qwen_inference(frame)
            elapsed = round(time.time() - t_start, 2)

            # Secondary validation guard (catches any values that slipped through)
            data = validate_and_clean(data, label=image_path.name)

            row = {
                "image_name":       image_path.name,
                "viewer_count":     data["viewer_count"],
                "male":             data["male"],
                "female":           data["female"],
                "engagement":       data["engagement"],
                "inference_time_s": elapsed,
            }

            print(f"  viewer_count={row['viewer_count']}  male={row['male']}  "
                  f"female={row['female']}  engagement={row['engagement']}  "
                  f"({elapsed}s)")

            # Write row immediately (safe if script is interrupted)
            writer.writerow(row)
            csv_file.flush()
            results.append(row)

            # Brief pause to let CPU cool down between runs
            if idx < total:
                print(f"  Waiting {DELAY_BETWEEN_IMAGES}s before next image...")
                time.sleep(DELAY_BETWEEN_IMAGES)

    # ── Save JSON ──────────────────────────────────────────────────────────────
    with open(json_path, "w", encoding="utf-8") as jf:
        json.dump(results, jf, indent=2)

    # ── Summary ───────────────────────────────────────────────────────────────
    total_elapsed = round(time.time() - total_start, 1)
    valid = [r for r in results if r["viewer_count"] > 0 or r["engagement"] > 0]

    print("\n" + "=" * 50)
    print("DATASET GENERATION COMPLETE")
    print("=" * 50)
    print(f"  Images processed  : {total}")
    print(f"  Total time        : {total_elapsed}s  (~{round(total_elapsed/60,1)} min)")
    print(f"  Avg time/image    : {round(total_elapsed/total, 1)}s")
    print()

    if results:
        avg_viewers    = round(sum(r["viewer_count"] for r in results) / total, 2)
        avg_engagement = round(sum(r["engagement"]   for r in results) / total, 2)
        total_viewers  = sum(r["viewer_count"] for r in results)
        total_male     = sum(r["male"]         for r in results)
        total_female   = sum(r["female"]       for r in results)

        print(f"  Total viewers     : {total_viewers}")
        print(f"  Total male        : {total_male}")
        print(f"  Total female      : {total_female}")
        print(f"  Avg viewers/image : {avg_viewers}")
        print(f"  Avg engagement    : {avg_engagement}%")

    print()
    print(f"  CSV  saved → {csv_path}")
    print(f"  JSON saved → {json_path}")
    print("=" * 50)


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate audience analytics dataset from images.")
    parser.add_argument("--folder", default="test_images",        help="Folder containing input images")
    parser.add_argument("--csv",    default="analytics_dataset.csv", help="Output CSV file path")
    parser.add_argument("--json",   default="analytics.json",     help="Output JSON file path")
    args = parser.parse_args()

    process_images(
        folder   = args.folder,
        csv_path = args.csv,
        json_path= args.json,
    )
