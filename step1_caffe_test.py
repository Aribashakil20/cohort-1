"""
STEP 1: OpenCV Caffe Model Test — Age & Gender Detection
=========================================================
Models used: Levi & Hassner (2015)
- Face detector: OpenCV DNN (ResNet SSD)
- Age: 8 age group buckets
- Gender: Male / Female

Run: python step1_caffe_test.py
"""

import cv2
import numpy as np
import json
import time
import os
import urllib.request
from pathlib import Path

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
MODEL_DIR   = "caffe_models"
RESULTS_DIR = "step1_results"
TEST_IMAGES_DIR = "test_images"
CONF_THRESHOLD  = 0.7   # face detection confidence threshold

AGE_BUCKETS = [
    '(0-2)', '(4-6)', '(8-12)', '(15-20)',
    '(25-32)', '(38-43)', '(48-53)', '(60-100)'
]
GENDER_LIST = ['Male', 'Female']

# ──────────────────────────────────────────────
# MODEL FILE DEFINITIONS
# ──────────────────────────────────────────────
MODEL_FILES = {
    "face_pbtxt":      "opencv_face_detector.pbtxt",
    "face_pb":         "opencv_face_detector_uint8.pb",
    "age_prototxt":    "age_deploy.prototxt",
    "age_caffemodel":  "age_net.caffemodel",
    "gender_prototxt": "gender_deploy.prototxt",
    "gender_caffemodel": "gender_net.caffemodel",
}

DOWNLOAD_URLS = {
    "face_pbtxt": [
        "https://raw.githubusercontent.com/opencv/opencv/master/samples/dnn/face_detector/opencv_face_detector.pbtxt",
    ],
    "face_pb": [
        "https://github.com/smahesh29/Gender-and-Age-Detection/raw/master/opencv_face_detector_uint8.pb",
    ],
    "age_prototxt": [
        "https://raw.githubusercontent.com/spmallick/learnopencv/master/AgeGender/age_deploy.prototxt",
    ],
    "age_caffemodel": [
        "https://github.com/smahesh29/Gender-and-Age-Detection/raw/master/age_net.caffemodel",
    ],
    "gender_prototxt": [
        "https://raw.githubusercontent.com/spmallick/learnopencv/master/AgeGender/gender_deploy.prototxt",
    ],
    "gender_caffemodel": [
        "https://github.com/smahesh29/Gender-and-Age-Detection/raw/master/gender_net.caffemodel",
    ],
}

# ──────────────────────────────────────────────
# STEP 1: DOWNLOAD MODELS
# ──────────────────────────────────────────────
def try_download(url, dest):
    """Stream-download a file in chunks. Returns True if successful and file >1KB."""
    tmp = dest + ".tmp"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as response:
            total = int(response.headers.get("Content-Length", 0))
            downloaded = 0
            chunk_size = 1024 * 64   # 64 KB chunks
            with open(tmp, "wb") as f:
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        pct = int(downloaded * 100 / total)
                        mb  = downloaded / (1024 * 1024)
                        print(f"\r       {pct}%  ({mb:.1f} MB)", end="", flush=True)
        print()
        size = os.path.getsize(tmp)
        if size < 1024:
            os.remove(tmp)
            return False
        os.replace(tmp, dest)
        return True
    except Exception as e:
        if os.path.exists(tmp):
            os.remove(tmp)
        return False


def download_models():
    os.makedirs(MODEL_DIR, exist_ok=True)
    all_present = True

    for key, filename in MODEL_FILES.items():
        dest = os.path.join(MODEL_DIR, filename)
        if os.path.exists(dest) and os.path.getsize(dest) > 1024:
            size_mb = os.path.getsize(dest) / (1024 * 1024)
            print(f"  [OK] {filename} ({size_mb:.1f} MB)")
            continue

        urls = DOWNLOAD_URLS[key]
        downloaded = False
        for url in urls:
            print(f"  [DOWNLOADING] {filename} from {url[:60]}...")
            if try_download(url, dest):
                size_mb = os.path.getsize(dest) / (1024 * 1024)
                print(f"  [DONE] {filename} ({size_mb:.1f} MB)")
                downloaded = True
                break
            else:
                print(f"  [RETRY] Trying next source...")

        if not downloaded:
            print(f"  [FAILED] {filename} — all sources failed")
            all_present = False

    return all_present


# ──────────────────────────────────────────────
# STEP 2: LOAD MODELS
# ──────────────────────────────────────────────
def load_models():
    face_net = cv2.dnn.readNet(
        os.path.join(MODEL_DIR, MODEL_FILES["face_pb"]),
        os.path.join(MODEL_DIR, MODEL_FILES["face_pbtxt"])
    )
    age_net = cv2.dnn.readNet(
        os.path.join(MODEL_DIR, MODEL_FILES["age_caffemodel"]),
        os.path.join(MODEL_DIR, MODEL_FILES["age_prototxt"])
    )
    gender_net = cv2.dnn.readNet(
        os.path.join(MODEL_DIR, MODEL_FILES["gender_caffemodel"]),
        os.path.join(MODEL_DIR, MODEL_FILES["gender_prototxt"])
    )
    print("  [OK] All 3 models loaded successfully")
    return face_net, age_net, gender_net


# ──────────────────────────────────────────────
# STEP 3: DETECT FACES
# ──────────────────────────────────────────────
def detect_faces(image, face_net, conf_threshold=CONF_THRESHOLD):
    h, w = image.shape[:2]
    blob = cv2.dnn.blobFromImage(image, 1.0, (300, 300),
                                  [104, 117, 123], swapRB=False)
    face_net.setInput(blob)
    detections = face_net.forward()

    faces = []
    for i in range(detections.shape[2]):
        conf = detections[0, 0, i, 2]
        if conf > conf_threshold:
            x1 = max(0, int(detections[0, 0, i, 3] * w))
            y1 = max(0, int(detections[0, 0, i, 4] * h))
            x2 = min(w, int(detections[0, 0, i, 5] * w))
            y2 = min(h, int(detections[0, 0, i, 6] * h))
            faces.append((x1, y1, x2, y2, float(conf)))

    return faces


# ──────────────────────────────────────────────
# STEP 4: PREDICT AGE & GENDER PER FACE
# ──────────────────────────────────────────────
MODEL_MEAN = (78.4263377603, 87.7689143744, 114.895847746)

def predict_age_gender(face_img, age_net, gender_net):
    blob = cv2.dnn.blobFromImage(face_img, 1.0, (227, 227),
                                  MODEL_MEAN, swapRB=False)
    # Gender
    gender_net.setInput(blob)
    gender_preds = gender_net.forward()
    gender = GENDER_LIST[gender_preds[0].argmax()]
    gender_conf = float(gender_preds[0].max())

    # Age
    age_net.setInput(blob)
    age_preds = age_net.forward()
    age = AGE_BUCKETS[age_preds[0].argmax()]
    age_conf = float(age_preds[0].max())

    return gender, gender_conf, age, age_conf


# ──────────────────────────────────────────────
# STEP 5: MAP AGE BUCKET -> AD CATEGORY
# ──────────────────────────────────────────────
def get_ad_category(age_bucket, gender):
    age_to_group = {
        '(0-2)':    'child',
        '(4-6)':    'child',
        '(8-12)':   'child',
        '(15-20)':  'youth',
        '(25-32)':  'adult',
        '(38-43)':  'adult',
        '(48-53)':  'middle_aged',
        '(60-100)': 'senior',
    }
    group = age_to_group.get(age_bucket, 'adult')
    g = gender[0]  # 'M' or 'F'

    ad_map = {
        ('child',       'M'): 'Toys / Boys Games',
        ('child',       'F'): 'Toys / Girls Games',
        ('youth',       'M'): 'Gaming / Sports',
        ('youth',       'F'): 'Fashion / Beauty',
        ('adult',       'M'): 'Cars / Finance',
        ('adult',       'F'): 'Lifestyle / Travel',
        ('middle_aged', 'M'): 'Health / Home Appliances',
        ('middle_aged', 'F'): 'Skincare / Wellness',
        ('senior',      'M'): 'Healthcare / Insurance',
        ('senior',      'F'): 'Healthcare / Insurance',
    }
    return group, ad_map.get((group, g), 'General Ad')


# ──────────────────────────────────────────────
# STEP 6: PROCESS ONE IMAGE
# ──────────────────────────────────────────────
def process_image(image_path, face_net, age_net, gender_net):
    image = cv2.imread(image_path)
    if image is None:
        return None, None

    start = time.time()
    faces = detect_faces(image, face_net)
    elapsed_detection = time.time() - start

    result = {
        "image":          os.path.basename(image_path),
        "faces_detected": len(faces),
        "detection_time_ms": round(elapsed_detection * 1000, 1),
        "people":         [],
        "challenges":     [],
    }

    if len(faces) == 0:
        result["challenges"].append("No faces detected — person may be too far, side-on, or low lighting")

    annotated = image.copy()

    for idx, (x1, y1, x2, y2, det_conf) in enumerate(faces):
        face_w = x2 - x1
        face_h = y2 - y1

        # Flag small faces
        challenges = []
        if face_w < 40 or face_h < 40:
            challenges.append(f"Face #{idx+1}: too small ({face_w}x{face_h}px) — age/gender may be inaccurate")

        # Pad face crop slightly for better model input
        pad = 20
        fx1 = max(0, x1 - pad)
        fy1 = max(0, y1 - pad)
        fx2 = min(image.shape[1], x2 + pad)
        fy2 = min(image.shape[0], y2 + pad)
        face_crop = image[fy1:fy2, fx1:fx2]

        t0 = time.time()
        gender, gender_conf, age, age_conf = predict_age_gender(face_crop, age_net, gender_net)
        inference_ms = round((time.time() - t0) * 1000, 1)

        age_group, ad_category = get_ad_category(age, gender)

        person = {
            "face_id":         idx + 1,
            "bbox":            [x1, y1, x2, y2],
            "face_size_px":    f"{face_w}x{face_h}",
            "detection_conf":  round(det_conf, 3),
            "gender":          gender,
            "gender_conf":     round(gender_conf, 3),
            "age_bucket":      age,
            "age_conf":        round(age_conf, 3),
            "age_group":       age_group,
            "ad_category":     ad_category,
            "inference_ms":    inference_ms,
        }
        result["people"].append(person)
        result["challenges"].extend(challenges)

        # Draw on annotated image
        color = (255, 100, 50) if gender == "Male" else (50, 100, 255)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label1 = f"{gender} ({gender_conf:.0%})"
        label2 = f"Age: {age} ({age_conf:.0%})"
        label3 = f"Ad: {ad_category}"
        cv2.putText(annotated, label1, (x1, y1 - 40), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)
        cv2.putText(annotated, label2, (x1, y1 - 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)
        cv2.putText(annotated, label3, (x1, y1 - 4),  cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 220, 255), 1)

    return result, annotated


# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────
def main():
    print("\n" + "="*60)
    print("  STEP 1: OpenCV Caffe Age & Gender Detection Test")
    print("="*60)

    # Download models
    print("\n[1/4] Checking / Downloading model files...")
    if not download_models():
        print("\n[ERROR] Some model files failed to download.")
        print("Please check your internet connection and try again.")
        return

    # Load models
    print("\n[2/4] Loading models...")
    face_net, age_net, gender_net = load_models()

    # Collect test images
    print("\n[3/4] Finding test images...")
    image_extensions = ('.jpg', '.jpeg', '.png', '.bmp')
    test_images = []

    for f in os.listdir(TEST_IMAGES_DIR):
        if f.lower().endswith(image_extensions):
            test_images.append(os.path.join(TEST_IMAGES_DIR, f))

    # Also include test.jpg from root
    if os.path.exists("test.jpg"):
        test_images.append("test.jpg")

    print(f"  Found {len(test_images)} test images")
    for img in test_images:
        print(f"    - {img}")

    if not test_images:
        print("[ERROR] No test images found in test_images/ folder")
        return

    # Process images
    print("\n[4/4] Running detection on all images...\n")
    os.makedirs(RESULTS_DIR, exist_ok=True)

    all_results = []
    total_faces = 0
    total_time  = 0

    for img_path in test_images:
        print(f"  Processing: {os.path.basename(img_path)}")
        result, annotated = process_image(img_path, face_net, age_net, gender_net)

        if result is None:
            print(f"    [SKIP] Could not read image")
            continue

        all_results.append(result)
        total_faces += result["faces_detected"]
        total_time  += result["detection_time_ms"]

        # Print per-image summary
        print(f"    Faces detected : {result['faces_detected']}")
        print(f"    Detection time : {result['detection_time_ms']} ms")

        for person in result["people"]:
            print(f"    Face #{person['face_id']}: {person['gender']} ({person['gender_conf']:.0%}) | "
                  f"Age {person['age_bucket']} ({person['age_conf']:.0%}) | "
                  f"-> {person['ad_category']}")

        if result["challenges"]:
            for c in result["challenges"]:
                print(f"    [CHALLENGE] {c}")

        # Save annotated image
        if annotated is not None:
            out_name = "result_" + os.path.basename(img_path)
            out_path = os.path.join(RESULTS_DIR, out_name)
            cv2.imwrite(out_path, annotated)
            print(f"    Saved: {out_path}")

        print()

    # Save JSON results
    summary = {
        "model":             "OpenCV Caffe (Levi & Hassner)",
        "total_images":      len(all_results),
        "total_faces":       total_faces,
        "avg_detection_ms":  round(total_time / len(all_results), 1) if all_results else 0,
        "results":           all_results,
    }
    json_path = os.path.join(RESULTS_DIR, "step1_caffe_results.json")
    with open(json_path, "w") as f:
        json.dump(summary, f, indent=2)

    # Final summary
    print("="*60)
    print("  STEP 1 COMPLETE — SUMMARY")
    print("="*60)
    print(f"  Total images processed : {len(all_results)}")
    print(f"  Total faces detected   : {total_faces}")
    print(f"  Avg detection time     : {summary['avg_detection_ms']} ms per image")
    print(f"  Results saved to       : {RESULTS_DIR}/")
    print(f"  JSON report            : {json_path}")
    print()

    # Gender + age group breakdown
    genders   = {"Male": 0, "Female": 0}
    age_groups = {}
    for r in all_results:
        for p in r["people"]:
            genders[p["gender"]] = genders.get(p["gender"], 0) + 1
            g = p["age_group"]
            age_groups[g] = age_groups.get(g, 0) + 1

    print("  Gender breakdown:")
    for g, count in genders.items():
        print(f"    {g}: {count}")

    print("\n  Age group breakdown:")
    for g, count in sorted(age_groups.items()):
        print(f"    {g}: {count}")

    print()
    print("  All challenges detected:")
    all_challenges = []
    for r in all_results:
        all_challenges.extend(r["challenges"])
    if all_challenges:
        seen = set()
        for c in all_challenges:
            key = c[:50]
            if key not in seen:
                seen.add(key)
                print(f"    - {c}")
    else:
        print("    None — all detections clean!")

    print("\n  Next -> Run Step 2: DeepFace test (python step2_deepface_test.py)")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
