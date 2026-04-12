"""
test_model_robustness.py
------------------------
Tests how the Qwen model reacts to the same image under different
visual conditions: brightness, blur, noise, contrast, etc.

What it does:
  1. Loads each image from test_images/
  2. Creates 7 variations of each image (original + 6 conditions)
  3. Runs Qwen inference on every variation
  4. Saves all modified images to test_outputs/ so you can see them
  5. Prints a clear comparison table
  6. Saves full results to test_robustness_results.json

Run with:
    python test_model_robustness.py
    python test_model_robustness.py --image test_images/OIP.jpg   (single image)

NOTE: Each inference takes ~30s on CPU.
      3 images x 7 conditions = 21 inferences = ~10-12 minutes total.
      Use --image to test just one image first.
"""

import cv2
import json
import time
import argparse
import numpy as np
from pathlib import Path
from qwen_inference import qwen_inference

# ── Output folder for modified images ─────────────────────────────────────────
OUTPUT_DIR = Path("test_outputs")
OUTPUT_DIR.mkdir(exist_ok=True)

# ── Supported image extensions ─────────────────────────────────────────────────
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# ── Delay between inferences (CPU cooldown) ────────────────────────────────────
DELAY_BETWEEN = 2  # seconds


# ─────────────────────────────────────────────────────────────────────────────
#  Image transformation functions
#  Each takes a BGR numpy array and returns a modified BGR numpy array.
# ─────────────────────────────────────────────────────────────────────────────

def original(img):
    """No change — baseline."""
    return img.copy()


def low_brightness(img):
    """Dim the image to 30% brightness — like a poorly lit room."""
    return cv2.convertScaleAbs(img, alpha=0.3, beta=0)


def very_low_brightness(img):
    """Almost dark — like a room with lights nearly off."""
    return cv2.convertScaleAbs(img, alpha=0.1, beta=0)


def high_brightness(img):
    """Overexposed — like looking into a bright light or sunlight glare."""
    return cv2.convertScaleAbs(img, alpha=1.8, beta=60)


def blurry(img):
    """Heavy Gaussian blur — simulates an out-of-focus camera."""
    return cv2.GaussianBlur(img, (21, 21), 0)


def noisy(img):
    """Adds random pixel noise — simulates a low-quality or old camera."""
    noise  = np.random.randint(0, 60, img.shape, dtype=np.uint8)
    noisy_img = cv2.add(img, noise)
    return noisy_img


def grayscale(img):
    """Converts to grayscale then back to BGR — removes all colour information."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


# ── List of all conditions to test ────────────────────────────────────────────
ALL_CONDITIONS = [
    ("original",            original,            "Normal image, no changes"),
    ("low_brightness",      low_brightness,      "30% brightness — dim room"),
    ("very_low_brightness", very_low_brightness, "10% brightness — almost dark"),
    ("high_brightness",     high_brightness,     "Overexposed — too much light"),
    ("blurry",              blurry,              "Heavy blur — unfocused camera"),
    ("noisy",               noisy,               "Random pixel noise — bad camera"),
    ("grayscale",           grayscale,           "No colour — black and white"),
]

# Quick mode: only 3 conditions — finishes in ~1 minute per image
QUICK_CONDITIONS = [
    ("original",        original,        "Normal image, no changes"),
    ("low_brightness",  low_brightness,  "30% brightness — dim room"),
    ("blurry",          blurry,          "Heavy blur — unfocused camera"),
]


# ─────────────────────────────────────────────────────────────────────────────
#  Run all conditions on one image
# ─────────────────────────────────────────────────────────────────────────────

def test_image(image_path: Path, conditions: list) -> list:
    """
    Applies every condition to one image, runs inference on each,
    returns a list of result dicts.
    """
    print(f"\n{'='*60}")
    print(f"  IMAGE: {image_path.name}")
    print(f"{'='*60}")

    img = cv2.imread(str(image_path))
    if img is None:
        print(f"  [ERROR] Could not read image. Skipping.")
        return []

    results = []
    total   = len(conditions)

    for idx, (name, transform_fn, description) in enumerate(conditions, start=1):
        print(f"\n  [{idx}/{total}] Condition: {name}")
        print(f"           {description}")

        # Apply the transformation
        modified = transform_fn(img)

        # Save the modified image so user can visually inspect it
        out_filename = f"{image_path.stem}__{name}.jpg"
        out_path     = OUTPUT_DIR / out_filename
        cv2.imwrite(str(out_path), modified)
        print(f"           Saved modified image: test_outputs/{out_filename}")

        # Run Qwen inference
        t_start = time.time()
        data    = qwen_inference(modified)
        elapsed = round(time.time() - t_start, 1)

        print(f"           Result: viewers={data['viewer_count']}  "
              f"male={data['male']}  female={data['female']}  "
              f"engagement={data['engagement']}%  ({elapsed}s)")

        results.append({
            "image":        image_path.name,
            "condition":    name,
            "description":  description,
            "viewer_count": data["viewer_count"],
            "male":         data["male"],
            "female":       data["female"],
            "engagement":   data["engagement"],
            "inference_s":  elapsed,
        })

        # Give CPU a short rest between inferences
        if idx < total:
            time.sleep(DELAY_BETWEEN)

    return results


# ─────────────────────────────────────────────────────────────────────────────
#  Print comparison table
# ─────────────────────────────────────────────────────────────────────────────

def print_table(all_results: list):
    """Prints a clean side-by-side comparison table."""

    # Group results by image
    images = {}
    for r in all_results:
        images.setdefault(r["image"], []).append(r)

    for image_name, rows in images.items():
        print(f"\n{'='*75}")
        print(f"  RESULTS FOR: {image_name}")
        print(f"{'='*75}")
        print(f"  {'Condition':<22} {'Viewers':>7} {'Male':>5} {'Female':>7} "
              f"{'Engagement':>11} {'Time':>6}")
        print(f"  {'-'*22} {'-'*7} {'-'*5} {'-'*7} {'-'*11} {'-'*6}")

        baseline_viewers = None
        for r in rows:
            # Mark rows where viewer_count differs from original
            if r["condition"] == "original":
                baseline_viewers = r["viewer_count"]
                flag = ""
            elif baseline_viewers is not None and r["viewer_count"] != baseline_viewers:
                flag = " <-- CHANGED"
            else:
                flag = ""

            print(f"  {r['condition']:<22} {r['viewer_count']:>7} {r['male']:>5} "
                  f"{r['female']:>7} {r['engagement']:>10}% {r['inference_s']:>5}s{flag}")

        print()


# ─────────────────────────────────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────────────────────────────────

def main(image_arg: str, quick: bool):

    conditions = QUICK_CONDITIONS if quick else ALL_CONDITIONS
    mode_label = "QUICK (3 conditions)" if quick else "FULL (7 conditions)"

    # Collect images to test
    if image_arg:
        paths = [Path(image_arg)]
        if not paths[0].exists():
            print(f"[ERROR] Image not found: {image_arg}")
            return
    else:
        folder = Path("test_images")
        paths  = sorted([
            p for p in folder.iterdir()
            if p.suffix.lower() in IMAGE_EXTENSIONS
        ])
        if not paths:
            print("[ERROR] No images found in test_images/")
            return

    total_images = len(paths)
    total_runs   = total_images * len(conditions)
    est_minutes  = round(total_runs * 15 / 60, 1)

    print(f"\nMode              : {mode_label}")
    print(f"Images to test    : {total_images}")
    print(f"Conditions each   : {len(conditions)}")
    print(f"Total inferences  : {total_runs}  (~{est_minutes} min on CPU)")
    print(f"Modified images   : saved to test_outputs/")

    all_results   = []
    overall_start = time.time()

    for image_path in paths:
        results = test_image(image_path, conditions)
        all_results.extend(results)

    # Print comparison table
    print_table(all_results)

    # Save full results to JSON
    output_json = "test_robustness_results.json"
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2)

    total_elapsed = round(time.time() - overall_start, 1)
    print(f"\nTotal time        : {total_elapsed}s")
    print(f"Full results saved: {output_json}")
    print(f"Modified images   : test_outputs/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test Qwen model robustness across image conditions.")
    parser.add_argument("--image", default="",            help="Test a single image. Default: all images in test_images/")
    parser.add_argument("--quick", action="store_true",   help="Run only 3 conditions instead of 7 (faster)")
    args = parser.parse_args()
    main(args.image, args.quick)
