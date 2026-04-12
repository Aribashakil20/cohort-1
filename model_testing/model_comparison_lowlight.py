"""
model_comparison_lowlight.py — Compare Models Under Poor Lighting
=================================================================

WHAT THIS SCRIPT DOES
----------------------
Takes your webcam feed, simulates different lighting conditions
(normal, dim, very dark, warm light, cool light), then runs
multiple AI models on each version of the same frame.

We compare:
  Model A — InsightFace buffalo_l   (current model in pipeline.py)
  Model B — InsightFace buffalo_s   (smaller, faster version)
  Model C — DeepFace + retinaface   (different face detector + attribute model)

For each model + each lighting condition, we record:
  - Were faces detected? (yes/no)
  - Predicted age
  - Predicted gender
  - Confidence score

WHY COMPARE MODELS?
-------------------
Each model was trained on different datasets with different techniques.
Some generalise better to dark or unusual lighting.
We want to find which one is most accurate on YOUR specific setup.

LIGHTING CONDITIONS SIMULATED
------------------------------
We artificially darken or tint the frame using OpenCV operations.
This is useful because:
  1. You don't need to actually change your room lighting to test
  2. Results are reproducible — same frame, same simulated conditions
  3. You can run this any time, not just when it's dark

Conditions:
  normal     → original frame, no change
  dim        → multiply pixels by 0.5 (half brightness)
  very_dark  → multiply pixels by 0.25 (very dark)
  warm_light → boost red channel, reduce blue (looks like candlelight)
  cool_light → boost blue channel, reduce red (looks like blue LED/moonlight)

HOW TO READ THE RESULTS
-----------------------
  Run this script. It opens 5 windows — one per lighting condition.
  Each window shows side-by-side panels for each model.
  Every 3 seconds it captures a fresh frame.
  Press S to save results to JSON for further analysis.
  Press Q to quit.
"""

import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import cv2
import time
import json
import numpy as np
from datetime import datetime
from preprocessing import enhance_frame, adaptive_enhance, auto_brightness_detect

# ── Load InsightFace models ───────────────────────────────────────────────────
print("[Loading] InsightFace buffalo_l  (large, accurate)...")
from insightface.app import FaceAnalysis
app_l = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
app_l.prepare(ctx_id=0, det_size=(640, 640))
print("[Loading] InsightFace buffalo_l  — ready")

print("[Loading] InsightFace buffalo_s  (small, fast)...")
app_s = FaceAnalysis(name="buffalo_s", providers=["CPUExecutionProvider"])
app_s.prepare(ctx_id=0, det_size=(640, 640))
print("[Loading] InsightFace buffalo_s  — ready")

print("[Loading] DeepFace (lazy-loaded on first call)...")
from deepface import DeepFace
print("[Loading] All models ready.\n")


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — LIGHTING SIMULATORS
# Each function takes a frame and returns a modified version.
# ══════════════════════════════════════════════════════════════════════════════

def sim_normal(frame):
    """No change — baseline."""
    return frame.copy()

def sim_dim(frame):
    """
    Multiply every pixel by 0.5 — halves brightness.
    cv2.convertScaleAbs: frame * alpha + beta
      alpha=0.5 → half brightness
      beta=0    → no offset
    """
    return cv2.convertScaleAbs(frame, alpha=0.5, beta=0)

def sim_very_dark(frame):
    """Multiply by 0.25 — very dark room, single dim lamp in background."""
    return cv2.convertScaleAbs(frame, alpha=0.25, beta=0)

def sim_warm(frame):
    """
    Warm (orange/yellow) tint — like incandescent bulb or candlelight.
    Boost red channel (+30), slightly reduce blue channel (-20).
    Split into B, G, R channels and modify independently.
    """
    b, g, r = cv2.split(frame)
    r = cv2.add(r, 30)   # more red
    b = cv2.subtract(b, 20)  # less blue
    return cv2.merge([b, g, r])

def sim_cool(frame):
    """
    Cool (blue) tint — like blue LED strip, phone screen glow, or moonlight.
    Boost blue channel (+30), reduce red (-20).
    """
    b, g, r = cv2.split(frame)
    b = cv2.add(b, 30)
    r = cv2.subtract(r, 20)
    return cv2.merge([b, g, r])

LIGHTING_CONDITIONS = {
    "normal":    sim_normal,
    "dim":       sim_dim,
    "very_dark": sim_very_dark,
    "warm":      sim_warm,
    "cool":      sim_cool,
}


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — MODEL RUNNERS
# Each function takes a frame and returns a list of face results.
# All return the same dict structure so comparison is easy.
# ══════════════════════════════════════════════════════════════════════════════

def run_insightface(app, model_name: str, frame: np.ndarray) -> dict:
    """
    Run an InsightFace model on a frame.
    Returns timing and per-face age/gender results.
    """
    t = time.time()
    try:
        faces = app.get(frame)
    except Exception as e:
        return {"model": model_name, "error": str(e), "faces": [], "ms": 0}
    ms = (time.time() - t) * 1000

    results = []
    for face in faces:
        age       = int(face.age)    if hasattr(face, "age")    and face.age    is not None else -1
        gender_id = int(face.gender) if hasattr(face, "gender") and face.gender is not None else -1
        gender    = "Male" if gender_id == 1 else "Female"
        score     = float(face.det_score) if hasattr(face, "det_score") else 0.0

        results.append({
            "age":        age,
            "gender":     gender,
            "confidence": round(score, 3),
            "bbox":       face.bbox.astype(int).tolist(),
        })

    return {"model": model_name, "faces": results, "ms": round(ms, 1), "error": None}


def run_deepface(frame: np.ndarray) -> dict:
    """
    Run DeepFace on a frame.
    DeepFace works differently — it returns a list of face analyses.
    We use the 'retinaface' detector (most accurate) and
    'skip' for the recognition model (we only want age/gender, not identity).

    enforce_detection=False: don't crash if no face found, return empty.
    """
    t = time.time()
    try:
        result = DeepFace.analyze(
            frame,
            actions=["age", "gender"],
            detector_backend="retinaface",
            enforce_detection=False,
            silent=True,
        )
        ms = (time.time() - t) * 1000

        # DeepFace returns a list of dicts (one per face)
        faces = []
        for r in result:
            gender = r.get("dominant_gender", "Unknown")
            # DeepFace gender_probability is a dict like {"Man": 90.2, "Woman": 9.8}
            gender_conf_key = "Man" if gender == "Man" else "Woman"
            conf = r.get("gender", {}).get(gender_conf_key, 0) / 100.0
            faces.append({
                "age":        r.get("age", -1),
                "gender":     "Male" if gender == "Man" else "Female",
                "confidence": round(conf, 3),
                "bbox":       list(r.get("region", {}).values())[:4] if r.get("region") else [],
            })
        return {"model": "DeepFace/retinaface", "faces": faces, "ms": round(ms, 1), "error": None}

    except Exception as e:
        ms = (time.time() - t) * 1000
        return {"model": "DeepFace/retinaface", "faces": [], "ms": round(ms, 1), "error": str(e)}


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — VISUALISER
# Draws bounding boxes and labels on the frame for each model's results.
# ══════════════════════════════════════════════════════════════════════════════

COLORS = {
    "InsightFace buffalo_l": (0, 255, 0),    # green
    "InsightFace buffalo_s": (255, 165, 0),  # orange
    "DeepFace/retinaface":   (0, 100, 255),  # blue
}

def draw_results(frame: np.ndarray, result: dict, title: str) -> np.ndarray:
    """Draw face boxes + age/gender labels on a copy of the frame."""
    out = frame.copy()
    color = COLORS.get(result["model"], (255, 255, 255))

    for face in result["faces"]:
        bbox = face["bbox"]
        if len(bbox) >= 4:
            x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
            cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
            label = f"{face['gender'][0]}, {face['age']}y ({face['confidence']:.0%})"
            cv2.putText(out, label, (x1, max(y1 - 6, 12)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)

    # Title bar at top
    cv2.rectangle(out, (0, 0), (out.shape[1], 40), (30, 30, 30), -1)
    faces_n = len(result["faces"])
    ms_str  = f"{result['ms']:.0f}ms"
    err_str = f" ERR:{result['error'][:20]}" if result.get("error") else ""
    header  = f"{title}  |  {faces_n} face(s)  |  {ms_str}{err_str}"
    cv2.putText(out, header, (6, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)

    return out


def draw_condition_panel(
    condition_name: str,
    orig_frame: np.ndarray,
    results_raw: list,
    results_enh: list,
) -> np.ndarray:
    """
    Build one display panel for a lighting condition.
    Layout: two rows × N models
      Row 1: raw frame results (no preprocessing)
      Row 2: enhanced frame results (with preprocessing)
    """
    panels_raw = [draw_results(orig_frame, r, f"RAW   {r['model']}") for r in results_raw]
    panels_enh = [draw_results(orig_frame, r, f"ENHANCED {r['model']}") for r in results_enh]

    row1 = np.hstack(panels_raw)
    row2 = np.hstack(panels_enh)

    # Separator bar with condition name
    sep_h = 30
    sep = np.zeros((sep_h, row1.shape[1], 3), dtype=np.uint8)
    cv2.putText(sep, f"  Lighting: {condition_name.upper()}  (top=raw  bottom=enhanced)",
                (6, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2)

    return np.vstack([sep, row1, row2])


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — MAIN LOOP
# ══════════════════════════════════════════════════════════════════════════════

def run_comparison():
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Cannot open webcam.")
        return

    all_results = []    # will be saved to JSON
    frame_number = 0
    last_run = 0
    INTERVAL = 3        # seconds between inference runs

    print("\nModel Comparison Running")
    print("  Press S  — save current results to JSON")
    print("  Press Q  — quit\n")

    # We'll show one window per lighting condition
    windows = list(LIGHTING_CONDITIONS.keys())
    # Track latest panels
    latest_panels = {name: None for name in windows}

    # Init windows
    for name in windows:
        cv2.namedWindow(f"Condition: {name}", cv2.WINDOW_NORMAL)
        cv2.resizeWindow(f"Condition: {name}", 1200, 450)

    while True:
        ret, raw_frame = cap.read()
        if not ret:
            break

        raw_frame = cv2.resize(raw_frame, (320, 240))
        frame_number += 1
        now = time.time()

        if now - last_run >= INTERVAL:
            last_run = now
            frame_row = {"frame": frame_number, "timestamp": datetime.now().isoformat(), "conditions": {}}

            for cond_name, sim_fn in LIGHTING_CONDITIONS.items():
                # Apply lighting simulation
                sim_frame = sim_fn(raw_frame)
                # Apply preprocessing to the simulated frame
                enh_frame = adaptive_enhance(sim_frame)

                # Run all three models on both versions
                results_raw = [
                    run_insightface(app_l, "InsightFace buffalo_l", sim_frame),
                    run_insightface(app_s, "InsightFace buffalo_s", sim_frame),
                    run_deepface(sim_frame),
                ]
                results_enh = [
                    run_insightface(app_l, "InsightFace buffalo_l", enh_frame),
                    run_insightface(app_s, "InsightFace buffalo_s", enh_frame),
                    run_deepface(enh_frame),
                ]

                # Build display panel
                panel = draw_condition_panel(cond_name, sim_frame, results_raw, results_enh)
                latest_panels[cond_name] = panel

                # Log to console
                print(f"\n[{cond_name}] brightness={auto_brightness_detect(sim_frame):.0f}")
                for r in results_raw:
                    faces_str = ", ".join(
                        f"{f['gender'][0]}/{f['age']}y" for f in r["faces"]
                    ) or "no faces"
                    print(f"  RAW  {r['model']:30s}: {faces_str}  ({r['ms']:.0f}ms)")
                for r in results_enh:
                    faces_str = ", ".join(
                        f"{f['gender'][0]}/{f['age']}y" for f in r["faces"]
                    ) or "no faces"
                    print(f"  ENH  {r['model']:30s}: {faces_str}  ({r['ms']:.0f}ms)")

                frame_row["conditions"][cond_name] = {
                    "brightness": round(auto_brightness_detect(sim_frame), 1),
                    "raw":       results_raw,
                    "enhanced":  results_enh,
                }

            all_results.append(frame_row)

        # Show latest panel per window
        for cond_name in windows:
            if latest_panels[cond_name] is not None:
                cv2.imshow(f"Condition: {cond_name}", latest_panels[cond_name])
            else:
                # Show a placeholder while first inference is running
                placeholder = np.zeros((100, 640, 3), dtype=np.uint8)
                cv2.putText(placeholder, f"Waiting for first inference ({cond_name})...",
                            (10, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (200, 200, 200), 1)
                cv2.imshow(f"Condition: {cond_name}", placeholder)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('s'):
            fname = f"lowlight_comparison_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(fname, "w") as f:
                json.dump(all_results, f, indent=2)
            print(f"\nSaved results to {fname}")

    cap.release()
    cv2.destroyAllWindows()

    # Auto-save on quit
    if all_results:
        fname = "lowlight_comparison_final.json"
        with open(fname, "w") as f:
            json.dump(all_results, f, indent=2)
        print(f"\nAuto-saved {len(all_results)} frames to {fname}")

        # Print summary table
        print("\n=== SUMMARY ===")
        print(f"{'Model':<30} {'Condition':<12} {'Mode':<10} {'Detections'}")
        print("-" * 65)
        for row in all_results[-1:]:   # last frame
            for cond, data in row["conditions"].items():
                for r in data["raw"]:
                    n = len(r["faces"])
                    print(f"{r['model']:<30} {cond:<12} {'RAW':<10} {n} face(s)")
                for r in data["enhanced"]:
                    n = len(r["faces"])
                    print(f"{r['model']:<30} {cond:<12} {'ENHANCED':<10} {n} face(s)")


if __name__ == "__main__":
    run_comparison()
