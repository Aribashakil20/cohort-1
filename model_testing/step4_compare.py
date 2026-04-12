"""
Step 4 — Side-by-Side Model Comparison
=======================================
Loads results from Step 1 (Caffe), Step 2 (DeepFace), Step 3 (InsightFace)
and produces a detailed comparison report:
  - How many faces each model found per image
  - Speed (ms/image) for each model
  - Age group agreement / disagreement between Caffe and InsightFace
  - Gender agreement / disagreement
  - Where each model failed and why
  - Overall winner per category
  - Saves step4_comparison.json for use in README / dashboard

Why a separate script?
  Each step saves its own JSON with the raw predictions.
  Step 4 does NO new inference — it only reads those JSONs and compares.
  This keeps comparison logic cleanly separated from model logic.
"""

import json
import os
import sys
from pathlib import Path

# Force UTF-8 output on Windows so box-drawing chars print correctly
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ──────────────────────────────────────────────────────────────────────────────
# 1. PATHS — where do the result files live?
# ──────────────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
STEP1_JSON = BASE_DIR / "step1_results" / "step1_caffe_results.json"
STEP2_JSON = BASE_DIR / "step2_results" / "step2_deepface_results.json"
STEP3_JSON = BASE_DIR / "step3_results" / "step3_insightface_results.json"
OUTPUT_JSON = BASE_DIR / "step4_comparison.json"

# ──────────────────────────────────────────────────────────────────────────────
# 2. HELPERS
# ──────────────────────────────────────────────────────────────────────────────
def load(path):
    """Load a JSON file and return the dict. Print an error if missing."""
    if not path.exists():
        print(f"  [!] File not found: {path}")
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def age_group(label_or_num):
    """
    Normalise age to one of 5 buckets so we can compare Caffe buckets
    (which use strings) against InsightFace numeric ages.
    """
    mapping = {
        "(0-2)": "child",   "(4-6)": "child",   "(8-12)": "child",
        "(15-20)": "youth", "(25-32)": "adult",  "(38-43)": "adult",
        "(48-53)": "middle_aged", "(60-100)": "senior",
    }
    if isinstance(label_or_num, str):
        return mapping.get(label_or_num, label_or_num)
    # numeric (InsightFace)
    n = int(label_or_num)
    if n <= 12:   return "child"
    if n <= 24:   return "youth"
    if n <= 45:   return "adult"
    if n <= 60:   return "middle_aged"
    return "senior"


def short_name(image_filename):
    """Truncate long filenames so tables stay readable."""
    name = Path(image_filename).name
    return name if len(name) <= 30 else name[:27] + "..."


def divider(char="─", width=72):
    print(char * width)


# ──────────────────────────────────────────────────────────────────────────────
# 3. LOAD ALL RESULTS
# ──────────────────────────────────────────────────────────────────────────────
print("\n" + "═" * 72)
print("  STEP 4 — MODEL COMPARISON REPORT")
print("  Caffe  vs  DeepFace  vs  InsightFace")
print("═" * 72)

caffe_data  = load(STEP1_JSON)
deep_data   = load(STEP2_JSON)
insight_data = load(STEP3_JSON)

# Index results by image filename for fast lookup
def index_by_image(data):
    return {r["image"]: r for r in data.get("results", [])}

caffe_by_img   = index_by_image(caffe_data)
deep_by_img    = index_by_image(deep_data)
insight_by_img = index_by_image(insight_data)

all_images = sorted(set(
    list(caffe_by_img) + list(deep_by_img) + list(insight_by_img)
))

# ──────────────────────────────────────────────────────────────────────────────
# 4. SUMMARY TABLE — faces detected + speed
# ──────────────────────────────────────────────────────────────────────────────
print("\n▶  SECTION A — Faces Detected & Speed\n")
print(f"  {'Image':<32} {'Caffe':>6} {'DeepFace':>9} {'InsightFace':>12}  {'Caffe ms':>9} {'InsF ms':>8}")
divider()

per_image_rows = []   # collect for JSON output

for img in all_images:
    c = caffe_by_img.get(img, {})
    d = deep_by_img.get(img, {})
    s = insight_by_img.get(img, {})

    c_faces = c.get("faces_detected", "—")
    d_faces = d.get("faces_detected", "—")
    s_faces = s.get("faces_detected", "—")
    c_ms    = f"{c.get('detection_time_ms', 0):.1f}"
    s_ms    = f"{s.get('detection_time_ms', 0):.1f}"
    d_status = "FAILED" if d.get("faces_detected", 0) == 0 and d.get("challenges") else d_faces

    print(f"  {short_name(img):<32} {str(c_faces):>6} {str(d_status):>9} {str(s_faces):>12}  {c_ms:>9} {s_ms:>8}")
    per_image_rows.append({
        "image": img,
        "caffe_faces": c_faces,
        "deepface_faces": d_faces,
        "insightface_faces": s_faces,
        "caffe_ms": float(c_ms),
        "insightface_ms": float(s_ms),
    })

divider()
c_total = caffe_data.get("total_faces", 0)
d_total = deep_data.get("total_faces", 0)
s_total = insight_data.get("total_faces", 0)
c_avg   = caffe_data.get("avg_detection_ms", 0)
d_avg   = deep_data.get("avg_detection_ms", 0)
s_avg   = insight_data.get("avg_detection_ms", 0)

print(f"  {'TOTAL':<32} {c_total:>6} {d_total:>9} {s_total:>12}  {c_avg:>9.1f} {s_avg:>8.1f}")
print(f"\n  DeepFace avg (failed): {d_avg:.1f} ms  ← all 7 images errored with file I/O issue")

# ──────────────────────────────────────────────────────────────────────────────
# 5. PER-IMAGE AGE & GENDER COMPARISON (Caffe vs InsightFace)
#    Only for images where BOTH models found faces
# ──────────────────────────────────────────────────────────────────────────────
print("\n\n▶  SECTION B — Age & Gender Comparison (Caffe vs InsightFace)\n")
print("    Only images where BOTH models detected faces are shown.\n")

comparison_details = []

for img in all_images:
    c = caffe_by_img.get(img, {})
    s = insight_by_img.get(img, {})
    c_people = c.get("people", [])
    s_people = s.get("people", [])

    if not c_people or not s_people:
        continue   # skip if either model found nothing

    face_count = min(len(c_people), len(s_people))  # compare matched pairs

    print(f"  Image: {short_name(img)}")
    print(f"  {'Face':>5}  {'Caffe Gender':>14}  {'InsF Gender':>12}  {'Gender Match':>13}  "
          f"{'Caffe Age':>10}  {'InsF Age':>10}  {'Age Match':>10}")
    divider("-", 72)

    image_comparisons = []
    gender_matches = 0
    age_matches = 0

    for i in range(face_count):
        cp = c_people[i]
        sp = s_people[i]

        c_gender = cp.get("gender", "?")
        s_gender = sp.get("gender", "?")
        c_ag = age_group(cp.get("age_bucket", cp.get("age_group", "?")))
        s_ag = age_group(sp.get("age", sp.get("age_group", "?")))

        g_match = "✓" if c_gender == s_gender else "✗"
        a_match = "✓" if c_ag == s_ag else "✗"

        if c_gender == s_gender: gender_matches += 1
        if c_ag == s_ag: age_matches += 1

        c_age_label = cp.get("age_bucket", "?")
        s_age_label = f"{sp.get('age', '?')} → {s_ag}"

        print(f"  {i+1:>5}  {c_gender:>14}  {s_gender:>12}  {g_match:>13}  "
              f"{c_age_label:>10}  {s_age_label:>10}  {a_match:>10}")

        image_comparisons.append({
            "face": i + 1,
            "caffe_gender": c_gender,
            "insightface_gender": s_gender,
            "gender_match": c_gender == s_gender,
            "caffe_age_bucket": cp.get("age_bucket", "?"),
            "insightface_age": sp.get("age"),
            "caffe_age_group": c_ag,
            "insightface_age_group": s_ag,
            "age_group_match": c_ag == s_ag,
        })

    pct_g = gender_matches / face_count * 100
    pct_a = age_matches / face_count * 100
    print(f"  Gender agreement: {gender_matches}/{face_count} ({pct_g:.0f}%)   "
          f"Age-group agreement: {age_matches}/{face_count} ({pct_a:.0f}%)")
    print()

    comparison_details.append({
        "image": img,
        "faces_compared": face_count,
        "gender_agreement_pct": round(pct_g, 1),
        "age_agreement_pct": round(pct_a, 1),
        "faces": image_comparisons,
    })

# ──────────────────────────────────────────────────────────────────────────────
# 6. FAILURE ANALYSIS — where did each model fail and why?
# ──────────────────────────────────────────────────────────────────────────────
print("\n▶  SECTION C — Failure Analysis\n")

failure_log = {"caffe": [], "deepface": [], "insightface": []}

for img in all_images:
    c = caffe_by_img.get(img, {})
    d = deep_by_img.get(img, {})
    s = insight_by_img.get(img, {})

    for challenge in c.get("challenges", []):
        print(f"  [Caffe]       {short_name(img)}: {challenge}")
        failure_log["caffe"].append({"image": img, "reason": challenge})

    for challenge in d.get("challenges", []):
        print(f"  [DeepFace]    {short_name(img)}: {challenge}")
        failure_log["deepface"].append({"image": img, "reason": challenge})

    for challenge in s.get("challenges", []):
        print(f"  [InsightFace] {short_name(img)}: {challenge}")
        failure_log["insightface"].append({"image": img, "reason": challenge})

# ──────────────────────────────────────────────────────────────────────────────
# 7. WINNER SUMMARY — which model wins each category?
# ──────────────────────────────────────────────────────────────────────────────
print("\n\n▶  SECTION D — Winner Summary\n")

categories = {
    "Most faces detected (sensitivity)": {
        "Caffe": c_total,
        "DeepFace": d_total,
        "InsightFace": s_total,
        "winner": "InsightFace",
        "note": f"InsightFace found {s_total} faces vs Caffe's {c_total}. DeepFace failed entirely.",
    },
    "Fastest per image (speed)": {
        "Caffe": f"{c_avg:.1f} ms",
        "DeepFace": f"{d_avg:.1f} ms (failed)",
        "InsightFace": f"{s_avg:.1f} ms",
        "winner": "Caffe",
        "note": f"Caffe at {c_avg:.1f} ms/img is ~{s_avg/c_avg:.0f}× faster than InsightFace.",
    },
    "Small-face detection": {
        "Caffe": "Detected but flagged ~25–31px faces as inaccurate",
        "DeepFace": "Failed — no faces",
        "InsightFace": "Detected same small faces, also flagged",
        "winner": "Tie (Caffe / InsightFace)",
        "note": "Both detected small faces; InsightFace found more of them.",
    },
    "Age accuracy (on large, clear faces)": {
        "Caffe": "Bucketed — misclassified adults as children in some images",
        "DeepFace": "N/A — failed",
        "InsightFace": "Numeric — predicted adult ages (21–45) that look more plausible",
        "winner": "InsightFace",
        "note": "Caffe bucketed several adult faces as '(8-12)' child; InsightFace gave numeric ages in the 20s–40s.",
    },
    "Gender accuracy (on large faces)": {
        "Caffe": "High confidence on clear faces (0.98+)",
        "DeepFace": "N/A — failed",
        "InsightFace": "Confident but differed from Caffe on several faces",
        "winner": "Inconclusive — no ground truth",
        "note": "Caffe and InsightFace disagreed on ~30% of faces. Without labeled ground truth we can't determine who is correct.",
    },
    "Ease of setup": {
        "Caffe": "Model files auto-downloaded, zero extra pip installs",
        "DeepFace": "pip install deepface — but file I/O bug blocked all inference",
        "InsightFace": "pip install insightface onnxruntime — worked after install",
        "winner": "Caffe",
        "note": "Caffe needs only opencv-python which is already installed.",
    },
    "Reliability (no crashes)": {
        "Caffe": "Ran on all 7 images successfully",
        "DeepFace": "Crashed on all 7 images — file signature error",
        "InsightFace": "Ran on all 7 images successfully",
        "winner": "Caffe / InsightFace (tie)",
        "note": "DeepFace's 'Unable to synchronously open file' error is likely an HDF5/model-weights issue on Windows.",
    },
}

winner_rows = []
for cat, info in categories.items():
    print(f"  Category : {cat}")
    print(f"  Winner   : {info['winner']}")
    print(f"  Note     : {info['note']}")
    print()
    winner_rows.append({
        "category": cat,
        "winner": info["winner"],
        "caffe": info["Caffe"],
        "deepface": info["DeepFace"],
        "insightface": info["InsightFace"],
        "note": info["note"],
    })

# ──────────────────────────────────────────────────────────────────────────────
# 8. RECOMMENDATION
# ──────────────────────────────────────────────────────────────────────────────
print("▶  SECTION E — Recommendation for SmartAudienceAnalysis\n")
recommendation = (
    "Use InsightFace (buffalo_l) as the primary age+gender model.\n"
    "  Reasons:\n"
    "  1. Highest face recall  — found 26 faces vs Caffe's 17 (53% more)\n"
    "  2. Numeric age output   — more granular than 8 fixed buckets\n"
    "  3. No mis-bucketing     — did not label adult faces as children\n"
    "  4. Confidence score     — det_score per face allows filtering weak detections\n"
    "\n"
    "  Trade-off: InsightFace is ~161× slower per image (4652 ms vs 29 ms).\n"
    "  Mitigation: Run on every Nth frame, not every frame. For a live display\n"
    "  audience system, refreshing every 5–10 seconds is fine — not every frame.\n"
    "\n"
    "  DeepFace: Fix the HDF5 model-weights download issue on Windows and re-test.\n"
    "  Its API (single function call) is the simplest of the three."
)
print(recommendation)
print()

# ──────────────────────────────────────────────────────────────────────────────
# 9. SAVE JSON
# ──────────────────────────────────────────────────────────────────────────────
output = {
    "step": 4,
    "title": "Model Comparison — Caffe vs DeepFace vs InsightFace",
    "summary": {
        "caffe":       {"total_faces": c_total, "avg_ms": c_avg, "status": "success"},
        "deepface":    {"total_faces": d_total, "avg_ms": d_avg, "status": "failed_all_images"},
        "insightface": {"total_faces": s_total, "avg_ms": s_avg, "status": "success"},
    },
    "per_image": per_image_rows,
    "age_gender_comparison": comparison_details,
    "failure_log": failure_log,
    "winners": winner_rows,
    "recommendation": recommendation,
}

with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(f"  Saved → {OUTPUT_JSON.name}\n")
print("═" * 72)
print("  Step 4 complete.")
print("═" * 72 + "\n")
