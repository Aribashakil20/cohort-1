import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"   # fix: OpenCV + ONNX both bundle OpenMP on Windows

import cv2
import time
import sqlite3
import threading
from collections import deque, Counter

# ── Load InsightFace model once at startup ─────────────────────────────────────
print("[Startup] Loading InsightFace model (buffalo_l)...")
from insightface.app import FaceAnalysis
_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
_app.prepare(ctx_id=0, det_size=(640, 640))
print("[Startup] Model ready.\n")

# ── Age group + ad category helpers ───────────────────────────────────────────
def get_age_group(age: int) -> str:
    if age <= 12:   return "child"
    elif age <= 24: return "youth"
    elif age <= 45: return "adult"
    elif age <= 60: return "middle_aged"
    else:           return "senior"

def get_ad_category(age_group: str, gender: str) -> str:
    g = "M" if gender.lower() == "male" else "F"
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

# ── Database setup ─────────────────────────────────────────────────────────────
conn   = sqlite3.connect("audience.db", check_same_thread=False)
cursor = conn.cursor()
cursor.execute("""
CREATE TABLE IF NOT EXISTS analytics (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    viewer_count INTEGER,
    male         INTEGER,
    female       INTEGER,
    age_group    TEXT,
    ad_category  TEXT,
    timestamp    DATETIME DEFAULT CURRENT_TIMESTAMP
)
""")
# Add new columns to existing DB if they don't exist yet
for col, coltype in [("age_group", "TEXT"), ("ad_category", "TEXT")]:
    try:
        cursor.execute(f"ALTER TABLE analytics ADD COLUMN {col} {coltype}")
    except sqlite3.OperationalError:
        pass  # column already exists
conn.commit()

# ── Camera setup ───────────────────────────────────────────────────────────────
cap = cv2.VideoCapture(0)

# ── Shared state ───────────────────────────────────────────────────────────────
latest_data = {
    "viewer_count": 0,
    "male":         0,
    "female":       0,
    "age_group":    "N/A",
    "ad_category":  "Waiting...",
}
is_inferring  = False
last_saved    = {}
last_run_time = 0
INFERENCE_INTERVAL = 15   # seconds between inferences

# ── Smoothing buffer ───────────────────────────────────────────────────────────
SMOOTH_WINDOW  = 3
result_history = deque(maxlen=SMOOTH_WINDOW)

def get_smoothed():
    if not result_history:
        return latest_data.copy()

    smoothed_viewers = min(r["viewer_count"] for r in result_history)

    latest = result_history[-1]
    total  = latest["male"] + latest["female"]
    if total > 0 and smoothed_viewers > 0:
        male   = round(smoothed_viewers * latest["male"] / total)
        female = smoothed_viewers - male
    elif smoothed_viewers > 0:
        male   = smoothed_viewers // 2
        female = smoothed_viewers - male
    else:
        male, female = 0, 0

    # Most common ad category across buffer
    ad_counts  = Counter(r["ad_category"] for r in result_history)
    age_counts = Counter(r["age_group"]   for r in result_history)

    return {
        "viewer_count": smoothed_viewers,
        "male":         male,
        "female":       female,
        "age_group":    age_counts.most_common(1)[0][0],
        "ad_category":  ad_counts.most_common(1)[0][0],
    }

# ── Background inference thread ────────────────────────────────────────────────
def run_inference(frame):
    global latest_data, is_inferring, last_run_time

    try:
        faces = _app.get(frame)
    except Exception as e:
        print(f"[InsightFace] Error: {e}")
        is_inferring  = False
        last_run_time = time.time()
        return

    viewer_count = len(faces)
    male_count   = 0
    categories   = []
    age_groups   = []

    for face in faces:
        age       = int(face.age)    if hasattr(face, "age")    and face.age    is not None else 30
        gender_id = int(face.gender) if hasattr(face, "gender") and face.gender is not None else 0
        gender    = "Male" if gender_id == 1 else "Female"

        if gender == "Male":
            male_count += 1

        ag = get_age_group(age)
        age_groups.append(ag)
        categories.append(get_ad_category(ag, gender))

    female_count = viewer_count - male_count

    if categories:
        dominant_ad       = Counter(categories).most_common(1)[0][0]
        dominant_age_grp  = Counter(age_groups).most_common(1)[0][0]
    else:
        dominant_ad      = "No faces detected"
        dominant_age_grp = "N/A"

    raw = {
        "viewer_count": viewer_count,
        "male":         male_count,
        "female":       female_count,
        "age_group":    dominant_age_grp,
        "ad_category":  dominant_ad,
    }

    result_history.append(raw)
    latest_data   = get_smoothed()
    last_run_time = time.time()
    is_inferring  = False

    print(f"[InsightFace] Raw={raw}  Smoothed={latest_data}  (buffer={len(result_history)})")


# ── Main loop ──────────────────────────────────────────────────────────────────
frame_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        print("Camera read failed. Exiting.")
        break

    frame = cv2.resize(frame, (640, 480))
    frame_count += 1
    current_time = time.time()

    # Trigger inference after cooldown AND only when idle
    if (current_time - last_run_time) >= INFERENCE_INTERVAL and not is_inferring:
        is_inferring = True
        thread = threading.Thread(target=run_inference, args=(frame.copy(),), daemon=True)
        thread.start()

    # Save to DB when new result arrives
    if latest_data != last_saved and not is_inferring:
        cursor.execute("""
            INSERT INTO analytics (viewer_count, male, female, age_group, ad_category)
            VALUES (?, ?, ?, ?, ?)
        """, (
            latest_data["viewer_count"],
            latest_data["male"],
            latest_data["female"],
            latest_data["age_group"],
            latest_data["ad_category"],
        ))
        conn.commit()
        last_saved = latest_data.copy()
        print(f"[DB] Saved: {latest_data}")

    # ── Draw overlay ───────────────────────────────────────────────────────────
    if is_inferring:
        cv2.rectangle(frame, (5, 205), (310, 240), (0, 0, 0), -1)
        cv2.putText(frame, "Analyzing... (AI running)",
                    (10, 230), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

    buf_label = f"Buffer: {len(result_history)}/{SMOOTH_WINDOW}"
    cv2.putText(frame, buf_label,
                (10, 460), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)

    cv2.putText(frame, f"Viewers:   {latest_data['viewer_count']}",
                (10, 35),  cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0),   2)
    cv2.putText(frame, f"Male:      {latest_data['male']}",
                (10, 75),  cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 100, 0), 2)
    cv2.putText(frame, f"Female:    {latest_data['female']}",
                (10, 115), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 100, 255), 2)
    cv2.putText(frame, f"Age Group: {latest_data['age_group']}",
                (10, 155), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
    cv2.putText(frame, f"Ad:        {latest_data['ad_category']}",
                (10, 192), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
    cv2.putText(frame, f"Frame:     {frame_count}",
                (10, 225), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)

    cv2.imshow("Smart Audience Analysis", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# ── Cleanup ────────────────────────────────────────────────────────────────────
cap.release()
conn.close()
cv2.destroyAllWindows()
print("Done.")
