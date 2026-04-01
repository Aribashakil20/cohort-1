"""
Live InsightFace Demo — Webcam
==============================
Opens your webcam and runs InsightFace (buffalo_l) on every Nth frame.
For each detected face it draws on screen:
  - Bounding box  (blue = Female, orange = Male)
  - Age (numeric) and age group
  - Gender + detection confidence
  - Ad category the person maps to

Why every Nth frame?
  InsightFace takes ~200-500 ms per frame on CPU.
  If we ran it every frame the video would freeze.
  So we run inference in a background thread and display
  the LAST known result on every frame — the video stays smooth.

Controls:
  Q  — quit
  S  — save current frame as a screenshot
  +  — run inference more often  (decrease interval)
  -  — run inference less often  (increase interval)

Requirements (already installed from Step 3):
  pip install insightface onnxruntime opencv-python
"""

import os
import sys
import time
import threading
import cv2
import numpy as np

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"   # fix: OpenCV + ONNX both bundle OpenMP on Windows

# ─────────────────────────────────────────────────────────────────
# CONFIG — change these if needed
# ─────────────────────────────────────────────────────────────────
CAMERA_INDEX    = 0       # 0 = built-in webcam, 1 = first external camera
MODEL_PACK      = "buffalo_l"   # most accurate; buffalo_s is faster
INFERENCE_EVERY = 15      # run InsightFace on every Nth frame (lower = more frequent but laggier)
SHOW_FPS        = True    # show FPS counter on screen
SCREENSHOT_DIR  = "live_screenshots"

# ─────────────────────────────────────────────────────────────────
# AGE → GROUP → AD CATEGORY  (same logic as step3_insightface_test.py)
# ─────────────────────────────────────────────────────────────────
def get_age_group(age: int) -> str:
    if age <= 12:   return "child"
    elif age <= 24: return "youth"
    elif age <= 45: return "adult"
    elif age <= 60: return "middle_aged"
    else:           return "senior"

def get_ad_category(age_group: str, gender: str) -> str:
    g = "M" if gender == "Male" else "F"
    ad_map = {
        ("child",       "M"): "Toys / Boys Games",
        ("child",       "F"): "Toys / Girls Games",
        ("youth",       "M"): "Gaming / Sports",
        ("youth",       "F"): "Fashion / Beauty",
        ("adult",       "M"): "Cars / Finance",
        ("adult",       "F"): "Lifestyle / Travel",
        ("middle_aged", "M"): "Health / Home Appliances",
        ("middle_aged", "F"): "Skincare / Wellness",
        ("senior",      "M"): "Healthcare / Insurance",
        ("senior",      "F"): "Healthcare / Insurance",
    }
    return ad_map.get((age_group, g), "General Ad")

# ─────────────────────────────────────────────────────────────────
# LOAD MODEL  (runs once at startup)
# ─────────────────────────────────────────────────────────────────
def load_model():
    try:
        from insightface.app import FaceAnalysis
    except ImportError:
        print("\n[ERROR] InsightFace is not installed.")
        print("  Run:  pip install insightface onnxruntime\n")
        sys.exit(1)

    print(f"[*] Loading InsightFace '{MODEL_PACK}' model pack ... (first run downloads weights)")
    app = FaceAnalysis(name=MODEL_PACK, providers=["CPUExecutionProvider"])
    # det_size: the resolution InsightFace resizes the frame to before detection.
    # 320x320  — very fast, misses small faces
    # 640x640  — good balance (default)
    # 1280x1280 — best accuracy, slowest
    app.prepare(ctx_id=0, det_size=(640, 640))
    print("[+] Model ready.\n")
    return app

# ─────────────────────────────────────────────────────────────────
# DRAW RESULTS ONTO A FRAME
# Each face gets a coloured box + text labels
# ─────────────────────────────────────────────────────────────────
def draw_faces(frame, faces_data):
    """
    faces_data: list of dicts produced by run_inference()
    We draw on a copy so the original frame is never modified.
    """
    out = frame.copy()

    for face in faces_data:
        x1, y1, x2, y2 = face["bbox"]
        gender    = face["gender"]
        age       = face["age"]
        age_group = face["age_group"]
        det_score = face["det_score"]
        ad_cat    = face["ad_category"]

        # Blue box = Female, Orange box = Male
        color = (200, 80, 30) if gender == "Male" else (30, 80, 200)

        # Bounding box
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)

        # Semi-transparent background behind text so it's readable on any background
        label_lines = [
            f"{gender}  {det_score:.0%}",
            f"Age {age} -> {age_group}",
            f"{ad_cat}",
        ]
        line_h = 18
        pad    = 4
        box_top    = max(0, y1 - len(label_lines) * line_h - pad * 2)
        box_bottom = y1
        overlay = out.copy()
        cv2.rectangle(overlay, (x1, box_top), (x2, box_bottom), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.5, out, 0.5, 0, out)

        for i, line in enumerate(label_lines):
            y_text = box_top + pad + (i + 1) * line_h - 2
            cv2.putText(out, line, (x1 + 3, y_text),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.48, color, 1, cv2.LINE_AA)

    return out

# ─────────────────────────────────────────────────────────────────
# INFERENCE  (runs in a background thread so video stays smooth)
# ─────────────────────────────────────────────────────────────────
def run_inference(app, frame):
    """
    Takes a BGR frame from OpenCV, runs InsightFace, returns a list of
    per-face dicts. This is called in a background thread.

    Why a background thread?
      cv2.imshow() must stay on the main thread (OS window requirement).
      If we called app.get() on the main thread, the window would freeze
      for 200-500 ms every inference cycle. The thread keeps it smooth.
    """
    results = []
    try:
        faces = app.get(frame)
    except Exception as e:
        print(f"[inference error] {e}")
        return results

    for face in faces:
        bbox      = face.bbox.astype(int).tolist()
        x1, y1, x2, y2 = bbox
        age       = int(face.age) if hasattr(face, "age") and face.age is not None else -1
        gender_id = int(face.gender) if hasattr(face, "gender") and face.gender is not None else -1
        gender    = "Male" if gender_id == 1 else "Female"
        det_score = float(face.det_score)
        age_grp   = get_age_group(age) if age >= 0 else "unknown"
        ad_cat    = get_ad_category(age_grp, gender)

        results.append({
            "bbox":       [x1, y1, x2, y2],
            "gender":     gender,
            "age":        age,
            "age_group":  age_grp,
            "det_score":  det_score,
            "ad_category": ad_cat,
        })

    return results

# ─────────────────────────────────────────────────────────────────
# DRAW HUD (heads-up display) — top bar with summary stats
# ─────────────────────────────────────────────────────────────────
def draw_hud(frame, faces_data, fps, inference_ms, inference_every):
    h, w = frame.shape[:2]

    # Count genders
    males   = sum(1 for f in faces_data if f["gender"] == "Male")
    females = sum(1 for f in faces_data if f["gender"] == "Female")
    total   = len(faces_data)

    # HUD bar at top
    bar_h = 36
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, bar_h), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

    hud_text = (
        f"Faces: {total}   Male: {males}   Female: {females}   "
        f"FPS: {fps:.1f}   Inference: {inference_ms:.0f}ms   "
        f"Every {inference_every} frames  |  Q=quit  S=screenshot  +/-=speed"
    )
    cv2.putText(frame, hud_text, (8, 24),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220, 220, 220), 1, cv2.LINE_AA)

    # Bottom bar: ad categories present in this frame
    if faces_data:
        ads = list({f["ad_category"] for f in faces_data})
        ads_text = "Serving: " + "  |  ".join(ads)
        overlay2 = frame.copy()
        cv2.rectangle(overlay2, (0, h - 28), (w, h), (20, 20, 20), -1)
        cv2.addWeighted(overlay2, 0.7, frame, 0.3, 0, frame)
        cv2.putText(frame, ads_text, (8, h - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 220, 255), 1, cv2.LINE_AA)

    return frame

# ─────────────────────────────────────────────────────────────────
# MAIN LOOP
# ─────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  Live InsightFace Demo")
    print("=" * 60)

    # 1. Load InsightFace model
    app = load_model()

    # 2. Open webcam
    print(f"[*] Opening camera index {CAMERA_INDEX} ...")
    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        print(f"[ERROR] Could not open camera {CAMERA_INDEX}.")
        print("  Try changing CAMERA_INDEX to 1 or 2 at the top of this file.")
        sys.exit(1)

    # Set capture resolution (comment out if your camera doesn't support it)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"[+] Camera opened at {actual_w}x{actual_h}\n")
    print("  Press Q to quit | S to save screenshot | +/- to change inference rate\n")

    os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    # Shared state between main thread and inference thread
    last_faces      = []         # most recent inference results (list of dicts)
    inference_ms    = 0.0        # how long the last inference took
    inference_lock  = threading.Lock()
    inference_busy  = False      # True while a thread is running

    inference_every = INFERENCE_EVERY   # mutable via +/- keys

    frame_count   = 0
    fps_counter   = 0
    fps_start     = time.time()
    current_fps   = 0.0

    def inference_thread_fn(frame_copy):
        """Runs in background. Writes results back to shared state."""
        nonlocal last_faces, inference_ms, inference_busy
        t0 = time.time()
        results = run_inference(app, frame_copy)
        elapsed = (time.time() - t0) * 1000
        with inference_lock:
            last_faces   = results
            inference_ms = elapsed
            inference_busy = False

    # 3. Main capture + display loop
    while True:
        ret, frame = cap.read()
        if not ret:
            print("[!] Frame read failed — camera disconnected?")
            break

        frame_count += 1
        fps_counter += 1

        # Update FPS counter every second
        now = time.time()
        if now - fps_start >= 1.0:
            current_fps = fps_counter / (now - fps_start)
            fps_counter = 0
            fps_start   = now

        # Trigger inference every Nth frame, but only if no thread is already running
        if frame_count % inference_every == 0 and not inference_busy:
            inference_busy = True
            # Pass a COPY of the frame to the thread — the main loop keeps using `frame`
            t = threading.Thread(target=inference_thread_fn, args=(frame.copy(),), daemon=True)
            t.start()

        # Draw the last known face results onto the current frame
        with inference_lock:
            faces_snapshot = list(last_faces)
            ms_snapshot    = inference_ms

        display = draw_faces(frame, faces_snapshot)
        display = draw_hud(display, faces_snapshot, current_fps, ms_snapshot, inference_every)

        cv2.imshow("InsightFace Live — Age & Gender", display)

        # Key handling
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q") or key == 27:   # Q or Esc
            break
        elif key == ord("s"):
            ts   = time.strftime("%Y%m%d_%H%M%S")
            path = os.path.join(SCREENSHOT_DIR, f"screenshot_{ts}.jpg")
            cv2.imwrite(path, display)
            print(f"[S] Screenshot saved: {path}")
        elif key == ord("+") or key == ord("="):
            inference_every = max(1, inference_every - 5)
            print(f"[+] Inference every {inference_every} frames")
        elif key == ord("-"):
            inference_every = min(120, inference_every + 5)
            print(f"[-] Inference every {inference_every} frames")

    # 4. Clean up
    cap.release()
    cv2.destroyAllWindows()
    print("\n[*] Camera released. Goodbye.")

if __name__ == "__main__":
    main()
