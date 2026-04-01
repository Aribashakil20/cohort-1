"""
STEP 2: DeepFace Age & Gender Detection Test
============================================
Model: DeepFace (default backend: VGG-Face / retinaface detector)
- Gives NUMERIC age (e.g., 27) instead of buckets
- Detects faces itself — no separate face detector needed
- Returns gender as 'Man' or 'Woman' with confidence %

Run: python step2_deepface_test.py
"""

import sys
import cv2
import json
import time
import os
import numpy as np
from deepface import DeepFace

# Fix Windows console encoding
sys.stdout.reconfigure(encoding='utf-8')

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
RESULTS_DIR     = "step2_results"
TEST_IMAGES_DIR = "test_images"
DETECTOR        = "opencv"     # options: opencv, retinaface, mtcnn, ssd, dlib

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
    g = "M" if gender.lower() in ("man", "male", "m") else "F"
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
# PROCESS ONE IMAGE
# ──────────────────────────────────────────────
def process_image(image_path):
    image = cv2.imread(image_path)
    if image is None:
        return None, None

    start = time.time()
    try:
        analysis = DeepFace.analyze(
            img_path        = image,     # numpy array avoids Windows file-read bug
            actions         = ["age", "gender"],
            enforce_detection = False,   # don't crash if no face found
            detector_backend  = DETECTOR,
            silent            = True,
        )
    except Exception as e:
        elapsed = round((time.time() - start) * 1000, 1)
        return {
            "image":            os.path.basename(image_path),
            "faces_detected":   0,
            "detection_time_ms": elapsed,
            "people":           [],
            "challenges":       [f"DeepFace error: {str(e)}"],
        }, image.copy()

    elapsed = round((time.time() - start) * 1000, 1)

    # DeepFace returns a list (one dict per face) or a single dict
    if isinstance(analysis, dict):
        analysis = [analysis]

    result = {
        "image":             os.path.basename(image_path),
        "faces_detected":    len(analysis),
        "detection_time_ms": elapsed,
        "people":            [],
        "challenges":        [],
    }

    annotated = image.copy()

    for idx, face_data in enumerate(analysis):
        age             = int(face_data.get("age", 0))
        dominant_gender = face_data.get("dominant_gender", "Man")
        gender_scores   = face_data.get("gender", {})
        gender_conf     = round(gender_scores.get(dominant_gender, 0) / 100, 3)

        region          = face_data.get("region", {})
        x = region.get("x", 0)
        y = region.get("y", 0)
        w = region.get("w", 0)
        h = region.get("h", 0)

        age_group    = get_age_group(age)
        ad_category  = get_ad_category(age_group, dominant_gender)

        challenges = []
        if w < 40 or h < 40:
            challenges.append(f"Face #{idx+1}: too small ({w}x{h}px) - age/gender may be inaccurate")
        if gender_conf < 0.65:
            challenges.append(f"Face #{idx+1}: low gender confidence ({gender_conf:.0%}) - uncertain")

        person = {
            "face_id":       idx + 1,
            "bbox":          [x, y, x+w, y+h],
            "face_size_px":  f"{w}x{h}",
            "age":           age,
            "age_group":     age_group,
            "gender":        dominant_gender,
            "gender_conf":   gender_conf,
            "ad_category":   ad_category,
        }
        result["people"].append(person)
        result["challenges"].extend(challenges)

        # Draw on annotated image
        color = (255, 100, 50) if dominant_gender.lower() == "man" else (50, 100, 255)
        cv2.rectangle(annotated, (x, y), (x+w, y+h), color, 2)
        cv2.putText(annotated, f"{dominant_gender} ({gender_conf:.0%})", (x, y-38),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)
        cv2.putText(annotated, f"Age: {age} -> {age_group}", (x, y-20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)
        cv2.putText(annotated, f"Ad: {ad_category}", (x, y-4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 220, 255), 1)

    if len(analysis) == 0:
        result["challenges"].append("No faces detected - person may be too far, side-on, or low lighting")

    return result, annotated

# ──────────────────────────────────────────────
# COMPARE WITH STEP 1
# ──────────────────────────────────────────────
def load_step1_results():
    path = os.path.join("step1_results", "step1_caffe_results.json")
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
    print("  STEP 2: DeepFace Age & Gender Detection Test")
    print("="*60)

    os.makedirs(RESULTS_DIR, exist_ok=True)

    # Collect test images
    print("\n[1/3] Finding test images...")
    image_extensions = ('.jpg', '.jpeg', '.png', '.bmp')
    test_images = []
    for f in os.listdir(TEST_IMAGES_DIR):
        if f.lower().endswith(image_extensions):
            test_images.append(os.path.join(TEST_IMAGES_DIR, f))
    if os.path.exists("test.jpg"):
        test_images.append("test.jpg")

    print(f"  Found {len(test_images)} test images")

    # Load Step 1 results for comparison
    step1 = load_step1_results()
    if step1:
        print(f"  Step 1 results loaded for comparison ({len(step1)} images)")
    else:
        print("  [NOTE] No Step 1 results found - run step1_caffe_test.py first for comparison")

    # Process images
    print("\n[2/3] Running DeepFace on all images...\n")
    all_results  = []
    total_faces  = 0
    total_time   = 0

    for img_path in test_images:
        print(f"  Processing: {os.path.basename(img_path)}")
        result, annotated = process_image(img_path)

        if result is None:
            print(f"    [SKIP] Could not read image")
            continue

        all_results.append(result)
        total_faces += result["faces_detected"]
        total_time  += result["detection_time_ms"]

        print(f"    Faces detected : {result['faces_detected']}")
        print(f"    Detection time : {result['detection_time_ms']} ms")

        for person in result["people"]:
            print(f"    Face #{person['face_id']}: {person['gender']} ({person['gender_conf']:.0%}) | "
                  f"Age {person['age']} -> {person['age_group']} | "
                  f"-> {person['ad_category']}")

        # Side-by-side comparison with Step 1
        img_name = os.path.basename(img_path)
        if img_name in step1:
            s1 = step1[img_name]
            print(f"    [vs Step 1] Caffe found {s1['faces_detected']} faces in {s1['detection_time_ms']}ms | "
                  f"DeepFace found {result['faces_detected']} faces in {result['detection_time_ms']}ms")

        if result["challenges"]:
            for c in result["challenges"]:
                print(f"    [CHALLENGE] {c}")

        if annotated is not None:
            out_path = os.path.join(RESULTS_DIR, "result_" + os.path.basename(img_path))
            cv2.imwrite(out_path, annotated)
            print(f"    Saved: {out_path}")
        print()

    # Save JSON
    summary = {
        "model":             "DeepFace",
        "detector_backend":  DETECTOR,
        "total_images":      len(all_results),
        "total_faces":       total_faces,
        "avg_detection_ms":  round(total_time / len(all_results), 1) if all_results else 0,
        "results":           all_results,
    }
    json_path = os.path.join(RESULTS_DIR, "step2_deepface_results.json")
    with open(json_path, "w") as f:
        json.dump(summary, f, indent=2)

    # Summary
    print("="*60)
    print("  STEP 2 COMPLETE - SUMMARY")
    print("="*60)
    print(f"  Total images processed : {len(all_results)}")
    print(f"  Total faces detected   : {total_faces}")
    print(f"  Avg detection time     : {summary['avg_detection_ms']} ms per image")
    print(f"  Results saved to       : {RESULTS_DIR}/")

    genders   = {"Man": 0, "Woman": 0}
    age_groups = {}
    ages = []
    for r in all_results:
        for p in r["people"]:
            genders[p["gender"]] = genders.get(p["gender"], 0) + 1
            g = p["age_group"]
            age_groups[g] = age_groups.get(g, 0) + 1
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

    # Step 1 vs Step 2 comparison table
    if step1:
        print("\n" + "-"*60)
        print("  STEP 1 (Caffe) vs STEP 2 (DeepFace) — FACE COUNT COMPARISON")
        print("-"*60)
        print(f"  {'Image':<40} {'Caffe':>6} {'DeepFace':>9}")
        print(f"  {'-'*40} {'-'*6} {'-'*9}")
        for r in all_results:
            img = r["image"]
            caffe_count = step1.get(img, {}).get("faces_detected", "N/A")
            df_count    = r["faces_detected"]
            match = "" if caffe_count == df_count else " <-- DIFFERENT"
            print(f"  {img:<40} {str(caffe_count):>6} {str(df_count):>9}{match}")

    print("\n  Next -> Run Step 3: InsightFace test (python step3_insightface_test.py)")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
