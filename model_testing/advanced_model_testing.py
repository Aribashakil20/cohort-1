"""
advanced_model_testing.py
--------------------------
Robustness & consistency test for the Qwen2-VL audience analysis system.

For each image in test_images/:
  - Generates 6 variations + original (7 conditions total)
  - Runs qwen_inference() 3 times per condition
  - Saves results incrementally (safe to Ctrl+C and resume)
  - Prints a clean comparison table + summary

RESUME SUPPORT: If advanced_test_results.json already exists, already-completed
inferences are skipped automatically — just re-run the script.
"""

import os
import gc
import json
import time
import numpy as np
import cv2

# ── Config ────────────────────────────────────────────────────────────────────
TEST_IMAGES_DIR    = "test_images"
OUTPUT_FILE        = "advanced_test_results.json"
NUM_RUNS           = 3
VARIANCE_THRESHOLD = 2.0   # flag if viewer_count std-dev exceeds this
COOLDOWN_SECS      = 2     # pause between inferences to let CPU/RAM settle


# ── Image variation generators ────────────────────────────────────────────────

def var_low_brightness(img):
    return np.clip(img.astype(np.float32) * 0.4, 0, 255).astype(np.uint8)

def var_very_low_brightness(img):
    return np.clip(img.astype(np.float32) * 0.15, 0, 255).astype(np.uint8)

def var_high_brightness(img):
    return np.clip(img.astype(np.float32) * 1.8, 0, 255).astype(np.uint8)

def var_blurry(img):
    return cv2.GaussianBlur(img, (21, 21), 0)

def var_noisy(img):
    noise = np.random.normal(0, 40, img.shape).astype(np.float32)
    return np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)

def var_grayscale(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


VARIATIONS = {
    "original":            lambda img: img.copy(),
    "low_brightness":      var_low_brightness,
    "very_low_brightness": var_very_low_brightness,
    "high_brightness":     var_high_brightness,
    "blurry":              var_blurry,
    "noisy":               var_noisy,
    "grayscale":           var_grayscale,
}


# ── Incremental save/load helpers ─────────────────────────────────────────────

def load_existing_results():
    """Load already-completed results from disk (for resume support)."""
    if not os.path.exists(OUTPUT_FILE):
        return []
    try:
        with open(OUTPUT_FILE, "r") as f:
            data = json.load(f)
        results = data.get("results", [])
        print(f"[Resume] Loaded {len(results)} existing result(s) from '{OUTPUT_FILE}'")
        return results
    except Exception:
        return []


def save_results(results):
    """Write all results + summaries to disk right now."""
    summaries = compute_summaries(results)
    with open(OUTPUT_FILE, "w") as f:
        json.dump({"results": results, "summaries": summaries}, f, indent=2)


def make_key(img_name, condition, run):
    return f"{img_name}|{condition}|{run}"


# ── Memory cleanup ────────────────────────────────────────────────────────────

def cleanup_memory():
    """Aggressively free CPU memory between inferences."""
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


# ── Core test runner ──────────────────────────────────────────────────────────

def run_tests():
    # Import here so model loads only when we actually start
    from qwen_inference import qwen_inference

    image_files = sorted([
        f for f in os.listdir(TEST_IMAGES_DIR)
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".webp"))
    ])

    if not image_files:
        print(f"[ERROR] No images found in '{TEST_IMAGES_DIR}/'")
        return

    total = len(image_files) * len(VARIATIONS) * NUM_RUNS
    print(f"\nFound {len(image_files)} image(s) | {len(VARIATIONS)} conditions | {NUM_RUNS} runs each")
    print(f"Total inferences planned: {total}")
    print(f"Cooldown between runs: {COOLDOWN_SECS}s\n")

    # Load previous progress (resume support)
    all_results  = load_existing_results()
    done_keys    = {make_key(r["image_name"], r["condition"], r["run_number"]) for r in all_results}
    skipped      = len(done_keys)
    if skipped:
        print(f"[Resume] Skipping {skipped} already-completed inference(s).\n")

    completed = 0
    for img_file in image_files:
        img_path = os.path.join(TEST_IMAGES_DIR, img_file)
        img_bgr  = cv2.imread(img_path)

        if img_bgr is None:
            print(f"[WARN] Could not read '{img_file}', skipping.")
            continue

        print(f"\n{'='*60}")
        print(f"Image: {img_file}  ({img_bgr.shape[1]}x{img_bgr.shape[0]})")
        print(f"{'='*60}")

        for condition, transform in VARIATIONS.items():
            # Pre-compute variation once for all 3 runs
            try:
                varied_img = transform(img_bgr)
            except Exception as e:
                print(f"  [WARN] Could not create variation '{condition}': {e}")
                continue

            for run in range(1, NUM_RUNS + 1):
                key = make_key(img_file, condition, run)
                if key in done_keys:
                    print(f"  [SKIP] {img_file} | {condition:<22} | run {run} (already done)")
                    continue

                label = f"[{img_file}] {condition:<22} run={run}/{NUM_RUNS}"
                print(f"  {label} ...", end=" ", flush=True)

                t_start = time.time()
                try:
                    result = qwen_inference(varied_img)
                except Exception as e:
                    print(f"\n  [ERROR] Inference failed: {e}")
                    result = {"viewer_count": 0, "male": 0, "female": 0, "engagement": 0}

                elapsed = round(time.time() - t_start, 2)

                record = {
                    "image_name":     img_file,
                    "condition":      condition,
                    "run_number":     run,
                    "viewer_count":   result.get("viewer_count", 0),
                    "male":           result.get("male", 0),
                    "female":         result.get("female", 0),
                    "engagement":     result.get("engagement", 0),
                    "inference_time": elapsed,
                }

                all_results.append(record)
                done_keys.add(key)
                completed += 1

                print(f"viewers={record['viewer_count']}  eng={record['engagement']}  time={elapsed}s")

                # Save after every single inference — no data loss on crash
                save_results(all_results)

                # Free memory and let CPU breathe
                cleanup_memory()
                if COOLDOWN_SECS > 0:
                    time.sleep(COOLDOWN_SECS)

            # Free variation array between conditions
            del varied_img
            gc.collect()

    print(f"\n[Done] {completed} new inference(s) completed.")
    print(f"[Saved] All results in '{OUTPUT_FILE}'")

    summaries = compute_summaries(all_results)
    print_table(all_results, summaries)


# ── Summary computation ───────────────────────────────────────────────────────

def compute_summaries(results):
    from collections import defaultdict
    groups = defaultdict(list)
    for r in results:
        groups[r["image_name"]].append(r)

    summaries = []
    for img_name, records in sorted(groups.items()):
        counts      = [r["viewer_count"]   for r in records]
        engagements = [r["engagement"]     for r in records]
        times       = [r["inference_time"] for r in records]

        std_dev    = float(np.std(counts))
        fluctuates = std_dev > VARIANCE_THRESHOLD

        summaries.append({
            "image_name":         img_name,
            "avg_viewer_count":   round(float(np.mean(counts)), 2),
            "variance":           round(float(np.var(counts)), 2),
            "std_dev":            round(std_dev, 2),
            "avg_engagement":     round(float(np.mean(engagements)), 2),
            "avg_inference_time": round(float(np.mean(times)), 2),
            "fluctuates_a_lot":   fluctuates,
            "note": "High variance — inconsistent across conditions/runs" if fluctuates
                    else "Stable — consistent results",
        })
    return summaries


# ── Pretty-print table ────────────────────────────────────────────────────────

def print_table(results, summaries):
    W = {"img": 24, "cond": 22, "run": 3, "v": 6, "m": 4, "f": 4, "e": 5, "t": 8}

    header = (
        f"{'Image':<{W['img']}} {'Condition':<{W['cond']}} "
        f"{'Run':>{W['run']}} {'View':>{W['v']}} {'M':>{W['m']}} "
        f"{'F':>{W['f']}} {'Eng':>{W['e']}} {'Time(s)':>{W['t']}}"
    )
    sep = "-" * len(header)

    print(f"\n{'='*len(header)}")
    print("  DETAILED RESULTS")
    print(f"{'='*len(header)}")
    print(header)
    print(sep)

    prev_img = prev_cond = None
    for r in results:
        il = r["image_name"][:W['img']] if r["image_name"] != prev_img else ""
        cl = r["condition"][:W['cond']] if (r["condition"] != prev_cond or r["image_name"] != prev_img) else ""
        prev_img, prev_cond = r["image_name"], r["condition"]
        print(
            f"{il:<{W['img']}} {cl:<{W['cond']}} "
            f"{r['run_number']:>{W['run']}} {r['viewer_count']:>{W['v']}} "
            f"{r['male']:>{W['m']}} {r['female']:>{W['f']}} "
            f"{r['engagement']:>{W['e']}} {r['inference_time']:>{W['t']}}"
        )

    print(f"\n{'='*len(header)}")
    print("  SUMMARY PER IMAGE")
    print(f"{'='*len(header)}")
    sh = f"{'Image':<{W['img']}}  {'AvgView':>7}  {'Var':>6}  {'Std':>5}  {'AvgEng':>6}  {'AvgTime':>7}  Note"
    print(sh)
    print("-" * (len(sh) + 10))

    for s in summaries:
        flag = "  !! FLUCTUATES" if s["fluctuates_a_lot"] else ""
        print(
            f"{s['image_name']:<{W['img']}}  "
            f"{s['avg_viewer_count']:>7}  "
            f"{s['variance']:>6}  "
            f"{s['std_dev']:>5}  "
            f"{s['avg_engagement']:>6}  "
            f"{s['avg_inference_time']:>6}s"
            f"{flag}"
        )

    print(f"\n{'='*len(header)}")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    run_tests()
