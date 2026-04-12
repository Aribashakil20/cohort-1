"""
STEP 3: InsightFace Age & Gender Detection Test
===============================================
Model: InsightFace (buffalo_l pack — ONNX-based)
- Face detector: RetinaFace (built-in, very accurate)
- Age: numeric (e.g., 27)
- Gender: 0 = Female, 1 = Male (with det_score confidence)
- Much faster than DeepFace once models are cached

Install:
    pip install insightface onnxruntime

Run: python step3_insightface_test.py
"""

import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"   # fix: OpenCV + ONNX both bundle OpenMP on Windows

import sys
import cv2
import json
import time
import numpy as np

sys.stdout.reconfigure(encoding="utf-8")

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
RESULTS_DIR     = "step3_results"
TEST_IMAGES_DIR = "test_images"
MODEL_PACK      = "buffalo_l"   # options: buffalo_l (best), buffalo_s (fast), antelopev2

# ──────────────────────────────────────────────
# MAP NUMERIC AGE -> AGE GROUP -> AD CATEGORY
# ──────────────────────────────────────────────
def get_age_group(age: int) -> str:
    if age <= 12:   return "child"
    elif age <= 24: return "youth"
    elif age <= 45: return "adult"
    elif age <= 60: return "middle_aged"
    else:           return "senior"

def get_ad_category(age_group: str, gender: str) -> str:
    g = "M" if gender.lower() in ("male", "man", "m") else "F"
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

# ──────────────────────────────────────────────
# LOAD INSIGHTFACE APP (once, shared across images)
# ──────────────────────────────────────────────
def load_model():
    try:
        import insightface
        from insightface.app import FaceAnalysis
    except ImportError:
        print("\n[ERROR] InsightFace not installed.")
        print("  Run:  pip install insightface onnxruntime\n")
        sys.exit(1)

    print(f"  Loading InsightFace model pack: {MODEL_PACK} ...")
    app = FaceAnalysis(
        name      = MODEL_PACK,
        providers = ["CPUExecutionProvider"],
    )
    # det_size=(640,640) — good for group photos; increase to (1280,1280) for large images
    app.prepare(ctx_id=0, det_size=(640, 640))
    print("  Model ready.\n")
    return app

# ──────────────────────────────────────────────
# PROCESS ONE IMAGE
# ──────────────────────────────────────────────
def process_image(app, image_path):
    image = cv2.imread(image_path)
    if image is None:
        return None, None

    # InsightFace expects BGR (OpenCV default) — no conversion needed
    start = time.time()
    try:
        faces = app.get(image)
    except Exception as e:
        elapsed = round((time.time() - start) * 1000, 1)
        return {
            "image":             os.path.basename(image_path),
            "faces_detected":    0,
            "detection_time_ms": elapsed,
            "people":            [],
            "challenges":        [f"InsightFace error: {str(e)}"],
        }, image.copy()

    elapsed = round((time.time() - start) * 1000, 1)

    result = {
        "image":             os.path.basename(image_path),
        "faces_detected":    len(faces),
        "detection_time_ms": elapsed,
        "people":            [],
        "challenges":        [],
    }

    annotated = image.copy()

    for idx, face in enumerate(faces):
        # InsightFace bbox is [x1, y1, x2, y2] as floats
        bbox      = face.bbox.astype(int)
        x1, y1, x2, y2 = bbox
        w, h      = x2 - x1, y2 - y1

        age       = int(face.age) if hasattr(face, "age") and face.age is not None else -1
        # gender: 1 = Male, 0 = Female
        gender_id = int(face.gender) if hasattr(face, "gender") and face.gender is not None else -1
        gender    = "Male" if gender_id == 1 else "Female"
        det_score = round(float(face.det_score), 3)

        age_group   = get_age_group(age) if age >= 0 else "unknown"
        ad_category = get_ad_category(age_group, gender) if age >= 0 else "General Ad"

        challenges = []
        if age < 0:
            challenges.append(f"Face #{idx+1}: age attribute not available")
        if w < 40 or h < 40:
            challenges.append(f"Face #{idx+1}: small face ({w}x{h}px) — attributes may be inaccurate")
        if det_score < 0.7:
            challenges.append(f"Face #{idx+1}: low detection confidence ({det_score:.0%})")

        person = {
            "face_id":      idx + 1,
            "bbox":         [int(x1), int(y1), int(x2), int(y2)],
            "face_size_px": f"{int(w)}x{int(h)}",
            "age":          int(age),
            "age_group":    age_group,
            "gender":       gender,
            "det_score":    float(det_score),
            "ad_category":  ad_category,
        }
        result["people"].append(person)
        result["challenges"].extend(challenges)

        # Draw on annotated image
        color = (255, 100, 50) if gender == "Male" else (50, 100, 255)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        cv2.putText(annotated, f"{gender} (conf {det_score:.0%})", (x1, y1 - 38),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)
        cv2.putText(annotated, f"Age: {age} -> {age_group}", (x1, y1 - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)
        cv2.putText(annotated, f"Ad: {ad_category}", (x1, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 220, 255), 1)

    if len(faces) == 0:
        result["challenges"].append("No faces detected — may be too far, side-on, or low lighting")

    return result, annotated

# ──────────────────────────────────────────────
# LOAD PREVIOUS STEP RESULTS FOR COMPARISON
# ──────────────────────────────────────────────
def load_step_results(step_num, filename):
    path = os.path.join(f"step{step_num}_results", filename)
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        data = json.load(f)
    return {r["image"]: r for r in data.get("results", [])}

# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────
def main():
    print("\n" + "="*60)
    print("  STEP 3: InsightFace Age & Gender Detection Test")
    print("="*60)

    os.makedirs(RESULTS_DIR, exist_ok=True)

    # Load model
    print("\n[1/3] Loading InsightFace model...")
    app = load_model()

    # Collect test images
    print("[2/3] Finding test images...")
    image_extensions = ('.jpg', '.jpeg', '.png', '.bmp')
    test_images = []
    for f in os.listdir(TEST_IMAGES_DIR):
        if f.lower().endswith(image_extensions):
            test_images.append(os.path.join(TEST_IMAGES_DIR, f))
    if os.path.exists("test.jpg"):
        test_images.append("test.jpg")

    print(f"  Found {len(test_images)} test images")

    # Load prior step results for comparison
    step1 = load_step_results(1, "step1_caffe_results.json")
    step2 = load_step_results(2, "step2_deepface_results.json")
    if step1:
        print(f"  Step 1 (Caffe) results loaded ({len(step1)} images)")
    if step2:
        print(f"  Step 2 (DeepFace) results loaded ({len(step2)} images)")

    # Process images
    print("\n[3/3] Running InsightFace on all images...\n")
    all_results = []
    total_faces = 0
    total_time  = 0

    for img_path in test_images:
        print(f"  Processing: {os.path.basename(img_path)}")
        result, annotated = process_image(app, img_path)

        if result is None:
            print(f"    [SKIP] Could not read image")
            continue

        all_results.append(result)
        total_faces += result["faces_detected"]
        total_time  += result["detection_time_ms"]

        print(f"    Faces detected : {result['faces_detected']}")
        print(f"    Detection time : {result['detection_time_ms']} ms")

        for person in result["people"]:
            print(f"    Face #{person['face_id']}: {person['gender']} (conf {person['det_score']:.0%}) | "
                  f"Age {person['age']} -> {person['age_group']} | "
                  f"-> {person['ad_category']}")

        # Side-by-side comparison
        img_name = os.path.basename(img_path)
        comparisons = []
        if img_name in step1:
            comparisons.append(f"Caffe={step1[img_name]['faces_detected']}")
        if img_name in step2:
            comparisons.append(f"DeepFace={step2[img_name]['faces_detected']}")
        comparisons.append(f"InsightFace={result['faces_detected']}")
        if len(comparisons) > 1:
            print(f"    [vs others] {' | '.join(comparisons)}")

        for c in result["challenges"]:
            print(f"    [CHALLENGE] {c}")

        if annotated is not None:
            out_path = os.path.join(RESULTS_DIR, "result_" + os.path.basename(img_path))
            cv2.imwrite(out_path, annotated)
            print(f"    Saved: {out_path}")
        print()

    # Save JSON
    summary = {
        "model":            "InsightFace",
        "model_pack":       MODEL_PACK,
        "total_images":     len(all_results),
        "total_faces":      total_faces,
        "avg_detection_ms": round(total_time / len(all_results), 1) if all_results else 0,
        "results":          all_results,
    }
    json_path = os.path.join(RESULTS_DIR, "step3_insightface_results.json")
    with open(json_path, "w") as f:
        json.dump(summary, f, indent=2)

    # ── SUMMARY ────────────────────────────────
    print("="*60)
    print("  STEP 3 COMPLETE - SUMMARY")
    print("="*60)
    print(f"  Total images processed : {len(all_results)}")
    print(f"  Total faces detected   : {total_faces}")
    print(f"  Avg detection time     : {summary['avg_detection_ms']} ms per image")
    print(f"  Results saved to       : {RESULTS_DIR}/")

    genders    = {"Male": 0, "Female": 0}
    age_groups = {}
    ages       = []
    for r in all_results:
        for p in r["people"]:
            genders[p["gender"]] = genders.get(p["gender"], 0) + 1
            g = p["age_group"]
            age_groups[g] = age_groups.get(g, 0) + 1
            if p["age"] >= 0:
                ages.append(p["age"])

    print("\n  Gender breakdown:")
    for g, count in genders.items():
        print(f"    {g}: {count}")

    print("\n  Age group breakdown:")
    for g, count in sorted(age_groups.items()):
        print(f"    {g}: {count}")

    if ages:
        print(f"\n  Age range detected : {min(ages)} - {max(ages)} years")
        print(f"  Average age        : {round(sum(ages)/len(ages), 1)} years")

    all_challenges = [c for r in all_results for c in r["challenges"]]
    print("\n  All challenges detected:")
    if all_challenges:
        seen = set()
        for c in all_challenges:
            key = c[:50]
            if key not in seen:
                seen.add(key)
                print(f"    - {c}")
    else:
        print("    None!")

    # ── 3-WAY COMPARISON TABLE ──────────────────
    if step1 or step2:
        print("\n" + "-"*72)
        print("  FACE COUNT: Caffe vs DeepFace vs InsightFace")
        print("-"*72)
        print(f"  {'Image':<38} {'Caffe':>6} {'DeepFace':>9} {'Insight':>8}")
        print(f"  {'-'*38} {'-'*6} {'-'*9} {'-'*8}")
        for r in all_results:
            img       = r["image"]
            c_count   = step1.get(img, {}).get("faces_detected", "N/A")
            df_count  = step2.get(img, {}).get("faces_detected", "N/A")
            ins_count = r["faces_detected"]
            flag = ""
            counts = [x for x in [c_count, df_count, ins_count] if x != "N/A"]
            if len(set(counts)) > 1:
                flag = " <-- DIFFERENT"
            name = img[:38]
            print(f"  {name:<38} {str(c_count):>6} {str(df_count):>9} {str(ins_count):>8}{flag}")

    print("\n  Done! Check step3_results/ for annotated images.")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
