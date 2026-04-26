"""
pipeline.py — Smart Audience Analysis: Integrated Pipeline
===========================================================

What this file does:
  Runs THREE things at the same time inside one Python process:

  1. Camera loop (main thread)
       Reads frames from webcam continuously.
       Draws live stats on screen.
       Must stay on the main thread — OpenCV's imshow() is an OS window
       and Windows/macOS require GUI calls to come from the thread that
       created the window (the main thread).

  2. InsightFace inference (background thread)
       Takes a copy of a frame, runs age + gender detection.
       Writes results into shared state (thread-safe with a Lock).
       Triggered every INFERENCE_EVERY frames so the camera loop never freezes.

  3. FastAPI server (background daemon thread)
       Uvicorn listens on port 8000.
       The dashboard (React) will call these endpoints to get live data:
         GET /api/v1/analytics/live     — latest DB row
         GET /api/v1/analytics/history  — last N rows (for charts)
         GET /api/v1/analytics/summary  — averages across a time window
         GET /api/v1/health             — confirms server + DB are alive

Tech stack:
  OpenCV        — camera capture and display
  InsightFace   — face detection, age estimation, gender classification (ONNX, CPU)
  SQLite        — stores one analytics row every SAVE_EVERY_SECONDS seconds
  FastAPI       — REST API framework (async, built on Starlette)
  Uvicorn       — ASGI server that runs FastAPI
  threading     — lets camera loop, inference, and API server run side-by-side

Technical challenges solved here:
  1. SQLite thread safety
       SQLite connections cannot be shared safely across threads by default.
       We use check_same_thread=False and wrap every DB operation in a Lock
       so reads (API) and writes (camera loop) never collide.

  2. OpenCV + ONNX OpenMP conflict on Windows
       Both OpenCV and ONNX Runtime bundle their own copy of the OpenMP
       runtime (libiomp5md.dll). Loading both causes a crash on Windows.
       Fix: set KMP_DUPLICATE_LIB_OK=TRUE before any import.

  3. Uvicorn inside a thread
       Uvicorn is designed to be the top-level process. To run it inside a
       thread we use uvicorn.Config + uvicorn.Server directly and call
       server.run() inside a daemon thread. daemon=True means the thread
       dies automatically when the main thread exits — no manual cleanup.

  4. Engagement without a gaze model
       A proper gaze model (e.g. L2CS-Net) tells you exactly where someone
       is looking. We don't have one yet. Instead we use InsightFace's
       det_score (detection confidence). A high det_score means the face
       is clearly visible and facing the camera — a reasonable proxy for
       "looking at the display". Threshold: 0.65. This will be replaced
       in Step 9 when we add real gaze detection.

Controls (camera window):
  Q or Esc  — quit everything
  S         — save a screenshot
  +/-       — speed up / slow down inference
"""

# ─── MUST be set before any other import ─────────────────────────────────────
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# ─── Standard library ─────────────────────────────────────────────────────────
import sys

# Add utils/ to path so we can import gaze_estimation
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "utils"))
import time
import sqlite3
import threading
from collections import deque, Counter
from datetime import datetime, timezone
from typing import Optional, List

# ─── Third-party ──────────────────────────────────────────────────────────────
import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── Local ────────────────────────────────────────────────────────────────────
from gaze_estimation import is_looking_at_screen

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — CONFIG
# Change these values to tune the system without touching any logic below.
# ══════════════════════════════════════════════════════════════════════════════

CAMERA_SOURCE      = 0          # Webcam:   0 = built-in, 1 = first external
                                # IP cam:   "rtsp://192.168.1.100:554/stream"
                                # With auth:"rtsp://admin:pass@192.168.1.100:554/stream"
RTSP_RECONNECT_DELAY = 5        # seconds to wait before retrying after a network drop
CAMERA_ID          = "cam_01"   # Unique name for this camera instance.
                                # Change to "cam_02", "cam_03" etc. when running
                                # multiple pipeline instances simultaneously.
                                # Every DB row is tagged with this ID so data
                                # from different cameras never gets mixed up.

MODEL_PACK         = "buffalo_l"  # InsightFace model; buffalo_s is faster but less accurate
INFERENCE_EVERY    = 15         # Run InsightFace on every Nth frame
                                # At 30fps this is every 0.5s. Lower = more frequent but laggier.
SAVE_EVERY_SECONDS = 10         # Write one DB row every N seconds
SMOOTH_WINDOW      = 3          # Average results over this many inference cycles before saving
ENGAGEMENT_THRESH  = 0.65       # det_score fallback threshold (used only if 3D landmarks unavailable)
YAW_THRESH         = 30.0       # max |yaw| in degrees → person is facing screen (left/right)
PITCH_THRESH       = 25.0       # max |pitch| in degrees → person is facing screen (up/down)

# ── Database backend ──────────────────────────────────────────────────────────
# DB_BACKEND = "sqlite"    → uses audience.db (default, no setup needed)
# DB_BACKEND = "postgres"  → uses PostgreSQL (run: pip install psycopg2-binary)
DB_BACKEND         = "sqlite"
DB_PATH            = "audience.db"   # used only when DB_BACKEND = "sqlite"

# PostgreSQL settings — only used when DB_BACKEND = "postgres"
PG_HOST            = "localhost"
PG_PORT            = 5432
PG_DBNAME          = "smartaudience"
PG_USER            = "postgres"
PG_PASSWORD        = "password"

API_HOST           = "0.0.0.0"  # 0.0.0.0 = accept connections from any device on the network
API_PORT           = 8000
SCREENSHOT_DIR     = "live_screenshots"

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — DATABASE
#
# Why SQLite?
#   It is a file-based database built into Python. No server to install or
#   configure. Good enough for a single-camera prototype. When we move to
#   multi-camera production we will switch to PostgreSQL and use SQLAlchemy.
#
# Why check_same_thread=False?
#   By default SQLite raises an error if any thread other than the one that
#   opened the connection tries to use it. Our API server runs in a different
#   thread. check_same_thread=False disables that guard — but then WE are
#   responsible for thread safety, which we handle with db_lock below.
# ══════════════════════════════════════════════════════════════════════════════

db_lock = threading.Lock()   # Only one thread can touch the DB at a time

# ── PostgreSQL compatibility wrapper ──────────────────────────────────────────
# sqlite3 and psycopg2 have two differences that would break our code:
#   1. Placeholder style: sqlite3 uses  ?   psycopg2 uses  %s
#   2. Row access: sqlite3.Row supports dict-style access; psycopg2 returns tuples
#
# PGConnection wraps a psycopg2 connection and:
#   - Replaces ? with %s in every SQL string automatically
#   - Uses RealDictCursor so rows behave like dicts (same as sqlite3.Row)
#   - Exposes .execute() and .commit() so the rest of the code is unchanged
#
# Result: all conn.execute(sql, params) calls work identically for both backends.

class PGConnection:
    """Thin wrapper that makes psycopg2 behave like sqlite3 for our use case."""

    def __init__(self, pg_conn):
        self._conn = pg_conn

    def execute(self, sql: str, params=None):
        import psycopg2.extras
        # sqlite3 uses ? as placeholder; psycopg2 uses %s
        sql = sql.replace("?", "%s")
        cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql, params or ())
        return cur   # caller can .fetchone() / .fetchall() on this

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


def open_db():
    """
    Open the database (SQLite or PostgreSQL based on DB_BACKEND config).
    Creates tables if they don't exist, runs migration for older databases.
    Returns a connection object — sqlite3.Connection or PGConnection wrapper.
    Both expose the same .execute() / .commit() / .close() interface.
    """
    if DB_BACKEND == "postgres":
        try:
            import psycopg2
        except ImportError:
            print("\n[ERROR] psycopg2 is not installed.")
            print("  Run:  pip install psycopg2-binary\n")
            sys.exit(1)
        pg_conn = psycopg2.connect(
            host=PG_HOST, port=PG_PORT, dbname=PG_DBNAME,
            user=PG_USER, password=PG_PASSWORD,
        )
        conn = PGConnection(pg_conn)
        print(f"[DB] Connected to PostgreSQL  {PG_HOST}:{PG_PORT}/{PG_DBNAME}")
    else:
        raw = sqlite3.connect(DB_PATH, check_same_thread=False)
        raw.row_factory = sqlite3.Row
        conn = raw
        print("[DB] Database ready:", DB_PATH)

    # ── Create tables ────────────────────────────────────────────────────────
    # SERIAL (PostgreSQL) vs INTEGER PRIMARY KEY AUTOINCREMENT (SQLite)
    if DB_BACKEND == "postgres":
        id_col = "id SERIAL PRIMARY KEY"
    else:
        id_col = "id INTEGER PRIMARY KEY AUTOINCREMENT"

    conn.execute(f"""
        CREATE TABLE IF NOT EXISTS analytics (
            {id_col},
            camera_id       TEXT    NOT NULL DEFAULT 'cam_01',
            timestamp       TEXT    NOT NULL,
            viewer_count    INTEGER NOT NULL,
            male_count      INTEGER NOT NULL DEFAULT 0,
            female_count    INTEGER NOT NULL DEFAULT 0,
            male_pct        REAL    NOT NULL DEFAULT 0,
            female_pct      REAL    NOT NULL DEFAULT 0,
            age_child_pct       REAL NOT NULL DEFAULT 0,
            age_youth_pct       REAL NOT NULL DEFAULT 0,
            age_adult_pct       REAL NOT NULL DEFAULT 0,
            age_middle_aged_pct REAL NOT NULL DEFAULT 0,
            age_senior_pct      REAL NOT NULL DEFAULT 0,
            dominant_age_group  TEXT NOT NULL DEFAULT 'unknown',
            engagement_rate REAL    NOT NULL DEFAULT 0,
            dominant_ad     TEXT    NOT NULL DEFAULT 'General Ad'
        )
    """)

    conn.execute(f"""
        CREATE TABLE IF NOT EXISTS dwell_sessions (
            {id_col},
            camera_id        TEXT NOT NULL DEFAULT 'cam_01',
            start_time       TEXT NOT NULL,
            end_time         TEXT NOT NULL,
            duration_seconds REAL NOT NULL,
            peak_count       INTEGER NOT NULL,
            avg_count        REAL NOT NULL
        )
    """)

    # ── SQLite migration — add new columns to existing databases ─────────────
    # (PostgreSQL doesn't need this — it always creates fresh tables above)
    if DB_BACKEND == "sqlite":
        new_columns = [
            ("camera_id",           "TEXT    NOT NULL DEFAULT 'cam_01'"),
            ("male_count",          "INTEGER NOT NULL DEFAULT 0"),
            ("female_count",        "INTEGER NOT NULL DEFAULT 0"),
            ("male_pct",            "REAL    NOT NULL DEFAULT 0"),
            ("female_pct",          "REAL    NOT NULL DEFAULT 0"),
            ("age_child_pct",       "REAL    NOT NULL DEFAULT 0"),
            ("age_youth_pct",       "REAL    NOT NULL DEFAULT 0"),
            ("age_adult_pct",       "REAL    NOT NULL DEFAULT 0"),
            ("age_middle_aged_pct", "REAL    NOT NULL DEFAULT 0"),
            ("age_senior_pct",      "REAL    NOT NULL DEFAULT 0"),
            ("dominant_age_group",  "TEXT    NOT NULL DEFAULT 'unknown'"),
            ("engagement_rate",     "REAL    NOT NULL DEFAULT 0"),
            ("dominant_ad",         "TEXT    NOT NULL DEFAULT 'General Ad'"),
            ("timestamp",           "TEXT    NOT NULL DEFAULT ''"),
        ]
        for col, col_type in new_columns:
            try:
                conn.execute(f"ALTER TABLE analytics ADD COLUMN {col} {col_type}")
            except sqlite3.OperationalError:
                pass  # column already exists

        dwell_new = [
            ("camera_id", "TEXT NOT NULL DEFAULT 'cam_01'"),
        ]
        for col, col_type in dwell_new:
            try:
                conn.execute(f"ALTER TABLE dwell_sessions ADD COLUMN {col} {col_type}")
            except sqlite3.OperationalError:
                pass

    conn.commit()
    return conn


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — AGE / GENDER HELPERS
# Same logic as live_insightface.py, centralised here.
# ══════════════════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — INSIGHTFACE MODEL
# Loaded once at startup. Loading takes a few seconds on first run because
# ONNX Runtime compiles the model graph. Subsequent runs are faster.
# ══════════════════════════════════════════════════════════════════════════════

def load_insightface_model():
    try:
        from insightface.app import FaceAnalysis
    except ImportError:
        print("\n[ERROR] InsightFace is not installed.")
        print("  Run:  pip install insightface onnxruntime\n")
        sys.exit(1)

    print("[*] Loading InsightFace model — this takes a few seconds on first run ...")
    app = FaceAnalysis(name=MODEL_PACK, providers=["CPUExecutionProvider"])

    # det_size: the resolution InsightFace internally resizes the frame to.
    # 640×640 is the best balance between speed and accuracy for a webcam feed.
    app.prepare(ctx_id=0, det_size=(640, 640))
    print("[+] InsightFace ready.\n")
    return app


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — SHARED STATE
#
# The camera loop (main thread) and inference thread both need to communicate.
# We use a plain dict + a Lock instead of a Queue because the camera loop
# only cares about the LATEST result, not a history of all results.
#
# state_lock: protects latest_faces and inference_busy
# db_lock:    protects all SQLite operations (defined in Section 2)
# ══════════════════════════════════════════════════════════════════════════════

state_lock      = threading.Lock()
latest_faces    = []      # most recent per-face inference results
inference_busy  = False   # True while an inference thread is running
inference_ms    = 0.0     # how long the last inference took (for display)

# Rolling buffer of raw inference results.
# We average over SMOOTH_WINDOW cycles before writing to DB.
# Why? A single frame can have noise (someone blinks, briefly turns away).
# Averaging across 3 cycles (≈30 seconds at 10s intervals) gives stable numbers.
result_buffer = deque(maxlen=SMOOTH_WINDOW)

last_save_time  = 0.0     # epoch seconds — when we last wrote a DB row
last_saved_data = {}      # prevents writing duplicate rows back-to-back

# ── Dwell time tracking (population-level, no individual tracking) ────────────
# We track "sessions" — contiguous periods where at least one person is present.
# When viewer_count goes  0 → >0: session starts.
# While viewer_count stays >0: session continues, we record peak and average.
# When viewer_count goes >0 → 0: session ends, duration saved to dwell_sessions.
dwell_active  = False   # True while at least one person is currently in frame
dwell_start   = 0.0     # epoch time when this session began
dwell_peak    = 0       # highest viewer_count seen in this session
dwell_samples: list = []  # viewer_count reading per 10-s window (for avg)


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 6 — INFERENCE
#
# Why run inference in a background thread?
#   InsightFace takes 200–800 ms per frame on CPU.
#   cv2.imshow() must be called every ~33 ms to show a smooth 30fps video.
#   If inference ran on the main thread, the video would freeze for up to
#   800 ms every inference cycle. The background thread keeps video smooth:
#   the main thread keeps displaying the LAST known result while the new
#   inference runs in the background.
# ══════════════════════════════════════════════════════════════════════════════

def run_inference_thread(app, frame: np.ndarray):
    """
    Called in a background thread.
    Runs InsightFace on `frame`, then writes results to shared state.
    """
    global latest_faces, inference_busy, inference_ms

    t_start = time.time()

    try:
        faces = app.get(frame)
    except Exception as e:
        print(f"[InsightFace] Inference error: {e}")
        with state_lock:
            inference_busy = False
        return

    elapsed_ms = (time.time() - t_start) * 1000

    # Build per-face result list
    face_results = []
    for face in faces:
        age       = int(face.age)    if hasattr(face, "age")    and face.age    is not None else 30
        gender_id = int(face.gender) if hasattr(face, "gender") and face.gender is not None else 0
        gender    = "Male" if gender_id == 1 else "Female"
        det_score = float(face.det_score)
        age_grp   = get_age_group(age)
        ad_cat    = get_ad_category(age_grp, gender)

        # Real gaze detection using head pose estimation.
        # is_looking_at_screen() runs solvePnP on InsightFace's 3D landmarks
        # to compute yaw (left/right) and pitch (up/down) angles.
        # If |yaw| < YAW_THRESH and |pitch| < PITCH_THRESH → looking at screen.
        # Falls back to det_score proxy if 3D landmarks are unavailable.
        looking, gaze_yaw, gaze_pitch = is_looking_at_screen(
            face, frame.shape,
            yaw_thresh=YAW_THRESH,
            pitch_thresh=PITCH_THRESH,
            det_fallback=ENGAGEMENT_THRESH,
        )

        face_results.append({
            "bbox":        face.bbox.astype(int).tolist(),
            "age":         age,
            "age_group":   age_grp,
            "gender":      gender,
            "det_score":   det_score,
            "looking":     looking,
            "gaze_yaw":    gaze_yaw,    # degrees, None if fallback was used
            "gaze_pitch":  gaze_pitch,  # degrees, None if fallback was used
            "ad_category": ad_cat,
        })

    with state_lock:
        latest_faces   = face_results
        inference_busy = False
        inference_ms   = elapsed_ms

    print(f"[InsightFace] {len(face_results)} faces | {elapsed_ms:.0f}ms | "
          f"engaged: {sum(1 for f in face_results if f['looking'])}/{len(face_results)}")


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 7 — AGGREGATION + DB SAVE
#
# We don't save every inference result to the DB — that would be noisy.
# Every SAVE_EVERY_SECONDS we:
#   1. Take a snapshot of the current face list
#   2. Add it to result_buffer (rolling window)
#   3. Average across the buffer → one stable summary row
#   4. Write that row to SQLite
#
# This means if someone walks in front of the camera for 1 second and leaves,
# their presence gets diluted across the 10-second window rather than skewing
# the data. Population-level counts, not individual tracking.
# ══════════════════════════════════════════════════════════════════════════════

def compute_summary(faces: list) -> dict:
    """
    Turn a list of per-face dicts into one summary dict for the DB row.
    """
    total = len(faces)

    if total == 0:
        return {
            "viewer_count":         0,
            "male_count":           0,
            "female_count":         0,
            "male_pct":             0.0,
            "female_pct":           0.0,
            "age_child_pct":        0.0,
            "age_youth_pct":        0.0,
            "age_adult_pct":        0.0,
            "age_middle_aged_pct":  0.0,
            "age_senior_pct":       0.0,
            "dominant_age_group":   "unknown",
            "engagement_rate":      0.0,
            "dominant_ad":          "No audience",
        }

    males   = sum(1 for f in faces if f["gender"] == "Male")
    females = total - males
    looking = sum(1 for f in faces if f["looking"])

    age_groups = [f["age_group"] for f in faces]
    age_counts = Counter(age_groups)
    dominant_age = age_counts.most_common(1)[0][0]

    ads = [f["ad_category"] for f in faces]
    dominant_ad = Counter(ads).most_common(1)[0][0]

    return {
        "viewer_count":         total,
        "male_count":           males,
        "female_count":         females,
        "male_pct":             round(males / total, 3),
        "female_pct":           round(females / total, 3),
        "age_child_pct":        round(age_counts.get("child",       0) / total, 3),
        "age_youth_pct":        round(age_counts.get("youth",       0) / total, 3),
        "age_adult_pct":        round(age_counts.get("adult",       0) / total, 3),
        "age_middle_aged_pct":  round(age_counts.get("middle_aged", 0) / total, 3),
        "age_senior_pct":       round(age_counts.get("senior",      0) / total, 3),
        "dominant_age_group":   dominant_age,
        "engagement_rate":      round(looking / total, 3),
        "dominant_ad":          dominant_ad,
    }


def maybe_save_to_db(conn: sqlite3.Connection):
    """
    Called from the main camera loop every frame.
    Only actually writes to DB when SAVE_EVERY_SECONDS has elapsed
    and the new summary differs from the last saved one.
    """
    global last_save_time, last_saved_data

    now = time.time()
    if now - last_save_time < SAVE_EVERY_SECONDS:
        return   # not time yet

    with state_lock:
        faces_snapshot = list(latest_faces)

    # Compute summary for this window
    summary = compute_summary(faces_snapshot)
    result_buffer.append(summary)

    # Average across the buffer for smoothing
    if not result_buffer:
        return

    smoothed = {
        "viewer_count":         round(sum(r["viewer_count"] for r in result_buffer) / len(result_buffer)),
        "male_count":           round(sum(r["male_count"]   for r in result_buffer) / len(result_buffer)),
        "female_count":         round(sum(r["female_count"] for r in result_buffer) / len(result_buffer)),
        "male_pct":             round(sum(r["male_pct"]     for r in result_buffer) / len(result_buffer), 3),
        "female_pct":           round(sum(r["female_pct"]   for r in result_buffer) / len(result_buffer), 3),
        "age_child_pct":        round(sum(r["age_child_pct"]       for r in result_buffer) / len(result_buffer), 3),
        "age_youth_pct":        round(sum(r["age_youth_pct"]       for r in result_buffer) / len(result_buffer), 3),
        "age_adult_pct":        round(sum(r["age_adult_pct"]       for r in result_buffer) / len(result_buffer), 3),
        "age_middle_aged_pct":  round(sum(r["age_middle_aged_pct"] for r in result_buffer) / len(result_buffer), 3),
        "age_senior_pct":       round(sum(r["age_senior_pct"]      for r in result_buffer) / len(result_buffer), 3),
        "dominant_age_group":   Counter(r["dominant_age_group"] for r in result_buffer).most_common(1)[0][0],
        "engagement_rate":      round(sum(r["engagement_rate"] for r in result_buffer) / len(result_buffer), 3),
        "dominant_ad":          Counter(r["dominant_ad"] for r in result_buffer).most_common(1)[0][0],
    }

    # Skip if identical to last save (nothing changed)
    comparable = {k: v for k, v in smoothed.items()}
    if comparable == last_saved_data:
        last_save_time = now
        return

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    with db_lock:
        conn.execute("""
            INSERT INTO analytics (
                camera_id, timestamp, viewer_count, male_count, female_count,
                male_pct, female_pct,
                age_child_pct, age_youth_pct, age_adult_pct,
                age_middle_aged_pct, age_senior_pct,
                dominant_age_group, engagement_rate, dominant_ad
            ) VALUES (
                ?, ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?,
                ?, ?,
                ?, ?, ?
            )
        """, (
            CAMERA_ID, ts,
            smoothed["viewer_count"], smoothed["male_count"], smoothed["female_count"],
            smoothed["male_pct"], smoothed["female_pct"],
            smoothed["age_child_pct"], smoothed["age_youth_pct"], smoothed["age_adult_pct"],
            smoothed["age_middle_aged_pct"], smoothed["age_senior_pct"],
            smoothed["dominant_age_group"], smoothed["engagement_rate"], smoothed["dominant_ad"],
        ))
        conn.commit()

    last_saved_data = comparable
    last_save_time  = now
    print(f"[DB] Saved row @ {ts} — viewers={smoothed['viewer_count']} "
          f"engagement={smoothed['engagement_rate']:.0%} "
          f"dominant_ad={smoothed['dominant_ad']!r}")

    # Update dwell session tracking based on the viewer count we just saved
    _update_dwell(conn, smoothed["viewer_count"])


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 7.5 — DWELL TIME TRACKING
#
# What is a "session"?
#   A session is a continuous window where at least one person is present.
#   It starts when the first person enters frame and ends when the last
#   person leaves frame (viewer_count drops to 0).
#
# Why 5-second minimum?
#   Very brief appearances (someone walking quickly past the camera) are not
#   meaningful dwell events. We ignore sessions shorter than 5 seconds.
#
# Privacy note:
#   We store only duration and counts (peak, average). No individual is
#   tracked. We don't know if it's the same person returning or a new person.
# ══════════════════════════════════════════════════════════════════════════════

MIN_DWELL_SECONDS = 5.0  # ignore sessions shorter than this (walk-bys)

def _update_dwell(conn: sqlite3.Connection, viewer_count: int):
    """
    Called after every DB save with the current smoothed viewer_count.
    Manages the session state machine and writes to dwell_sessions on session end.
    """
    global dwell_active, dwell_start, dwell_peak, dwell_samples

    now = time.time()

    if viewer_count > 0:
        if not dwell_active:
            # New session — someone just entered the frame
            dwell_active  = True
            dwell_start   = now
            dwell_peak    = viewer_count
            dwell_samples = [viewer_count]
            print(f"[Dwell] Session started — {viewer_count} viewer(s) in frame")
        else:
            # Session continues — update running stats
            dwell_peak = max(dwell_peak, viewer_count)
            dwell_samples.append(viewer_count)
    else:
        if dwell_active:
            # Session ended — everyone left the frame
            duration = now - dwell_start

            if duration >= MIN_DWELL_SECONDS:
                avg_count  = sum(dwell_samples) / len(dwell_samples)
                start_ts   = datetime.fromtimestamp(dwell_start, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                end_ts     = datetime.fromtimestamp(now,         tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

                with db_lock:
                    conn.execute(
                        """
                        INSERT INTO dwell_sessions
                            (camera_id, start_time, end_time, duration_seconds, peak_count, avg_count)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (CAMERA_ID, start_ts, end_ts, round(duration, 1), dwell_peak, round(avg_count, 1))
                    )
                    conn.commit()

                print(f"[Dwell] Session saved — duration={duration:.0f}s  "
                      f"peak={dwell_peak}  avg={avg_count:.1f}")
            else:
                print(f"[Dwell] Session too short ({duration:.0f}s) — skipped")

            # Reset for next session
            dwell_active  = False
            dwell_peak    = 0
            dwell_samples = []


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 8 — FASTAPI APP
#
# Why FastAPI?
#   - Automatic request validation (via Pydantic models)
#   - Auto-generated interactive docs at http://localhost:8000/docs
#   - Async support means it can handle multiple dashboard clients at once
#     without blocking
#   - CORS middleware lets the React dashboard (port 3000) call this server
#     (port 8000) — browsers block cross-origin requests by default
#
# Why run it in a daemon thread?
#   Uvicorn is normally a top-level process. To embed it in our pipeline
#   we use the lower-level uvicorn.Server API and call server.run() inside
#   a threading.Thread(daemon=True). daemon=True means: when the main thread
#   exits (user presses Q), this thread dies automatically — no extra cleanup.
# ══════════════════════════════════════════════════════════════════════════════

# Pydantic models define exactly what JSON shape each endpoint returns.
# FastAPI validates the data against these models before sending.
class AnalyticsRow(BaseModel):
    id:                  int
    camera_id:           str
    timestamp:           str
    viewer_count:        int
    male_count:          int
    female_count:        int
    male_pct:            float
    female_pct:          float
    age_child_pct:       float
    age_youth_pct:       float
    age_adult_pct:       float
    age_middle_aged_pct: float
    age_senior_pct:      float
    dominant_age_group:  str
    engagement_rate:     float
    dominant_ad:         str

class SummaryResponse(BaseModel):
    row_count:              int
    avg_viewer_count:       float
    avg_engagement_rate:    float
    avg_male_pct:           float
    avg_female_pct:         float
    dominant_age_group:     str
    dominant_ad:            str

class DwellSession(BaseModel):
    id:               int
    camera_id:        str
    start_time:       str
    end_time:         str
    duration_seconds: float
    peak_count:       int
    avg_count:        float

class HealthResponse(BaseModel):
    status:   str
    database: str


def create_api(conn: sqlite3.Connection) -> FastAPI:
    """
    Build and return the FastAPI app.
    `conn` is the shared SQLite connection — the same one the camera loop writes to.
    """
    api = FastAPI(
        title="Smart Audience Analysis API",
        description="Real-time audience analytics from camera + InsightFace",
        version="1.0.0",
    )

    # CORS — allows any origin (*)
    # In production you would restrict this to your dashboard's actual domain.
    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    # ── GET /api/v1/health ───────────────────────────────────────────────────
    # Dashboard calls this to confirm the server is alive before loading.
    @api.get("/api/v1/health", response_model=HealthResponse)
    def health():
        try:
            with db_lock:
                conn.execute("SELECT 1")
            db_status = "connected"
        except Exception:
            db_status = "error"
        return {"status": "ok", "database": db_status}

    # ── GET /api/v1/analytics/live ───────────────────────────────────────────
    # Returns the single most recent row — used for the "right now" panel.
    # Optional: ?camera_id=cam_01 to filter by a specific camera.
    @api.get("/api/v1/analytics/live", response_model=AnalyticsRow)
    def analytics_live(camera_id: Optional[str] = Query(default=None)):
        with db_lock:
            if camera_id:
                row = conn.execute(
                    "SELECT * FROM analytics WHERE camera_id = ? ORDER BY id DESC LIMIT 1",
                    (camera_id,)
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT * FROM analytics ORDER BY id DESC LIMIT 1"
                ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="No analytics data yet. "
                                "The system is collecting its first window — wait 10 seconds.")
        return dict(row)

    # ── GET /api/v1/analytics/history ────────────────────────────────────────
    # Returns the last `limit` rows in chronological order (oldest first).
    # Optional: ?camera_id=cam_01 to filter by a specific camera.
    @api.get("/api/v1/analytics/history", response_model=List[AnalyticsRow])
    def analytics_history(limit: int = Query(default=30, ge=1, le=1000),
                          camera_id: Optional[str] = Query(default=None)):
        with db_lock:
            if camera_id:
                rows = conn.execute(
                    """
                    SELECT * FROM (
                        SELECT * FROM analytics WHERE camera_id = ? ORDER BY id DESC LIMIT ?
                    ) ORDER BY id ASC
                    """,
                    (camera_id, limit)
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT * FROM (
                        SELECT * FROM analytics ORDER BY id DESC LIMIT ?
                    ) ORDER BY id ASC
                    """,
                    (limit,)
                ).fetchall()
        return [dict(r) for r in rows]

    # ── GET /api/v1/analytics/summary ────────────────────────────────────────
    # Returns averages across the last `limit` rows — used for summary cards.
    # Optional: ?camera_id=cam_01 to filter by a specific camera.
    @api.get("/api/v1/analytics/summary", response_model=SummaryResponse)
    def analytics_summary(limit: int = Query(default=30, ge=1, le=1000),
                          camera_id: Optional[str] = Query(default=None)):
        with db_lock:
            if camera_id:
                rows = conn.execute(
                    "SELECT * FROM analytics WHERE camera_id = ? ORDER BY id DESC LIMIT ?",
                    (camera_id, limit)
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM analytics ORDER BY id DESC LIMIT ?", (limit,)
                ).fetchall()

        if not rows:
            raise HTTPException(status_code=404, detail="No data yet.")

        n = len(rows)
        avg_viewers    = sum(r["viewer_count"]     for r in rows) / n
        avg_engagement = sum(r["engagement_rate"]  for r in rows) / n
        avg_male       = sum(r["male_pct"]         for r in rows) / n
        avg_female     = sum(r["female_pct"]       for r in rows) / n
        dom_age = Counter(r["dominant_age_group"] for r in rows).most_common(1)[0][0]
        dom_ad  = Counter(r["dominant_ad"]        for r in rows).most_common(1)[0][0]

        return {
            "row_count":           n,
            "avg_viewer_count":    round(avg_viewers,    2),
            "avg_engagement_rate": round(avg_engagement, 3),
            "avg_male_pct":        round(avg_male,       3),
            "avg_female_pct":      round(avg_female,     3),
            "dominant_age_group":  dom_age,
            "dominant_ad":         dom_ad,
        }

    # ── GET /api/v1/analytics/dwell ──────────────────────────────────────────
    # Returns the last `limit` dwell sessions (completed audience sessions).
    # Optional: ?camera_id=cam_01 to filter by a specific camera.
    @api.get("/api/v1/analytics/dwell", response_model=List[DwellSession])
    def analytics_dwell(limit: int = Query(default=20, ge=1, le=200),
                        camera_id: Optional[str] = Query(default=None)):
        with db_lock:
            if camera_id:
                rows = conn.execute(
                    """
                    SELECT * FROM (
                        SELECT * FROM dwell_sessions WHERE camera_id = ? ORDER BY id DESC LIMIT ?
                    ) ORDER BY id ASC
                    """,
                    (camera_id, limit)
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT * FROM (
                        SELECT * FROM dwell_sessions ORDER BY id DESC LIMIT ?
                    ) ORDER BY id ASC
                    """,
                    (limit,)
                ).fetchall()
        return [dict(r) for r in rows]

    return api


def start_api_server(conn: sqlite3.Connection):
    """
    Starts the FastAPI server in a background daemon thread.
    Returns immediately — the server runs in the background.
    """
    api = create_api(conn)
    config = uvicorn.Config(
        app=api,
        host=API_HOST,
        port=API_PORT,
        log_level="warning",   # reduce noise in the terminal
    )
    server = uvicorn.Server(config)

    def run_server():
        # On Windows, Python 3.8+ defaults to ProactorEventLoop which can
        # silently prevent uvicorn from binding when run inside a thread.
        # SelectorEventLoop is what uvicorn expects and works on all platforms.
        import asyncio
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        server.run()

    thread = threading.Thread(target=run_server, daemon=True, name="uvicorn")
    thread.start()
    time.sleep(1.5)   # give uvicorn time to bind before the camera loop starts
    print(f"[API] Server started at http://localhost:{API_PORT}")
    print(f"[API] Interactive docs: http://localhost:{API_PORT}/docs\n")


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 9 — DISPLAY OVERLAY
# Draws the live stats panel on top of the camera frame.
# Same approach as live_insightface.py but simplified — just the HUD bar.
# ══════════════════════════════════════════════════════════════════════════════

def draw_overlay(frame: np.ndarray, faces: list, fps: float, inf_ms: float, inf_every: int) -> np.ndarray:
    out = frame.copy()
    h, w = out.shape[:2]

    total   = len(faces)
    males   = sum(1 for f in faces if f["gender"] == "Male")
    females = total - males
    engaged = sum(1 for f in faces if f["looking"])

    # Draw bounding boxes
    for face in faces:
        x1, y1, x2, y2 = face["bbox"]
        color = (30, 100, 220) if face["gender"] == "Female" else (30, 140, 255)
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)

        # Show head pose angles if real gaze detection ran (yaw/pitch available)
        # Otherwise show det_score (fallback mode)
        if face.get("gaze_yaw") is not None:
            pose_str = f" Y:{face['gaze_yaw']:+.0f} P:{face['gaze_pitch']:+.0f}"
        else:
            pose_str = f" conf:{face['det_score']:.2f}"

        label = f"{face['gender']} {face['age']} | {face['age_group']}{pose_str}"
        engaged_label = " [LOOKING]" if face["looking"] else " [AWAY]"
        cv2.putText(out, label + engaged_label,
                    (x1, max(y1 - 6, 14)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)

    # Top HUD bar
    bar_h = 38
    overlay = out.copy()
    cv2.rectangle(overlay, (0, 0), (w, bar_h), (15, 15, 15), -1)
    cv2.addWeighted(overlay, 0.72, out, 0.28, 0, out)
    cam_label = "RTSP" if is_rtsp(CAMERA_SOURCE) else f"CAM:{CAMERA_SOURCE}"
    hud = (f"Viewers:{total}  M:{males}  F:{females}  "
           f"Engaged:{engaged}/{total}  "
           f"FPS:{fps:.1f}  AI:{inf_ms:.0f}ms  {cam_label}  "
           f"|  Q=quit  S=shot  +/-=speed")
    cv2.putText(out, hud, (8, 26),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (220, 220, 220), 1, cv2.LINE_AA)

    # Bottom bar: dominant ad
    if faces:
        ads = Counter(f["ad_category"] for f in faces)
        dom_ad = ads.most_common(1)[0][0]
        bbar = out.copy()
        cv2.rectangle(bbar, (0, h - 30), (w, h), (15, 15, 15), -1)
        cv2.addWeighted(bbar, 0.72, out, 0.28, 0, out)
        cv2.putText(out, f"Serving ad: {dom_ad}",
                    (8, h - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 220, 255), 1, cv2.LINE_AA)

    return out


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 9.5 — CAMERA OPEN / RECONNECT
#
# Why a dedicated function?
#   Opening a webcam and opening an RTSP stream need different handling:
#   - Webcam:  VideoCapture(0) — fast, works instantly
#   - RTSP:    VideoCapture("rtsp://...") — can hang silently if unreachable,
#              needs buffer size set to 1 to avoid stale frames
#
# Buffer size explained:
#   RTSP streams buffer frames internally. If inference takes 500ms and the
#   buffer holds 5 frames, you're analysing 2.5-second-old video. Setting
#   CAP_PROP_BUFFERSIZE = 1 means OpenCV discards old frames and always gives
#   you the most recent one — critical for real-time analysis.
# ══════════════════════════════════════════════════════════════════════════════

def is_rtsp(source) -> bool:
    """Returns True if source is an RTSP/HTTP URL, False if it is a webcam index."""
    return isinstance(source, str) and source.lower().startswith(("rtsp://", "http://", "https://"))


def open_camera(source):
    """
    Open a camera (webcam or RTSP/IP) and return a cv2.VideoCapture object.
    Exits the process with a clear message if the camera cannot be opened.

    Parameters
    ----------
    source : int or str
        0 / 1 / 2  → local webcam index
        "rtsp://..." → RTSP network stream
    """
    src_label = f"RTSP stream  {source}" if is_rtsp(source) else f"webcam index {source}"
    print(f"[*] Opening {src_label} ...")

    cap = cv2.VideoCapture(source)

    if is_rtsp(source):
        # Keep only 1 frame in the internal buffer.
        # Without this, OpenCV buffers several frames and you end up
        # processing video that is several seconds old.
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    if not cap.isOpened():
        print(f"\n[ERROR] Could not open {src_label}.")
        if is_rtsp(source):
            print("  Check:")
            print("  1. Camera is powered on and connected to the same network")
            print("  2. RTSP URL is correct (try it in VLC first)")
            print("  3. Username / password in the URL are correct")
            print("  4. Camera firewall allows connections on port 554")
        else:
            print(f"  Change CAMERA_SOURCE at the top of this file.")
            print(f"  Try 0, 1, or 2 for different connected cameras.")
        sys.exit(1)

    # Set resolution BEFORE the test read.
    # If we set resolution after reading a frame, OpenCV's internal buffer
    # holds a frame at the old resolution while the camera switches to the new
    # one — this causes a matrix dimension mismatch crash on the next read.
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    # Startup test — read one frame to confirm the stream is actually delivering data.
    # isOpened() returning True just means the connection was accepted;
    # it doesn't mean frames are flowing. A bad RTSP URL can pass isOpened()
    # but fail on the first read.
    ret, _ = cap.read()
    if not ret:
        print(f"\n[ERROR] Camera opened but first frame read failed.")
        if is_rtsp(source):
            print("  The camera accepted the connection but sent no video.")
            print("  Check the stream path in the URL.")
        cap.release()
        sys.exit(1)

    actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"[+] Camera ready at {actual_w}x{actual_h}  ({src_label})")
    return cap


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 10 — MAIN
# Ties everything together:
#   1. Load model
#   2. Open DB
#   3. Start API server (background thread)
#   4. Open camera
#   5. Run camera loop (main thread — required for cv2.imshow)
# ══════════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 65)
    print("  Smart Audience Analysis — Integrated Pipeline")
    print("=" * 65)

    # 1. Load InsightFace
    app = load_insightface_model()

    # 2. Open database
    conn = open_db()

    # 3. Start API server in background
    start_api_server(conn)

    # 4. Open camera (webcam or RTSP — handled by open_camera())
    cap = open_camera(CAMERA_SOURCE)
    print(f"[+] API docs: http://localhost:{API_PORT}/docs")
    print("    Press Q to quit | S to save screenshot | +/- to change speed\n")

    os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    # 5. Camera loop
    global inference_busy   # declared here so it can be set anywhere in main()

    frame_count    = 0
    fps_counter    = 0
    fps_start      = time.time()
    current_fps    = 0.0
    inference_every = INFERENCE_EVERY

    while True:
        ret, frame = cap.read()
        if not ret:
            if is_rtsp(CAMERA_SOURCE):
                # Network drop — release the old connection and try to reconnect.
                # We don't exit because network blips are expected in production.
                print(f"[!] Stream lost. Reconnecting in {RTSP_RECONNECT_DELAY}s ...")
                cap.release()
                time.sleep(RTSP_RECONNECT_DELAY)
                try:
                    cap = open_camera(CAMERA_SOURCE)
                    print("[+] Reconnected.")
                except SystemExit:
                    print("[!] Reconnect failed. Retrying ...")
                continue   # skip this iteration, try cap.read() again
            else:
                # Webcam hardware failure — nothing we can do, exit cleanly.
                print("[!] Webcam read failed. Is the camera disconnected?")
                break

        frame_count += 1
        fps_counter += 1

        # FPS calculation (update every second)
        now = time.time()
        if now - fps_start >= 1.0:
            current_fps = fps_counter / (now - fps_start)
            fps_counter = 0
            fps_start   = now

        # Trigger inference every Nth frame (if not already running).
        # We set inference_busy=True here (under the lock) before spawning the
        # thread so there is no window where two threads both see busy=False
        # and both launch at the same time.
        with state_lock:
            busy = inference_busy

        if frame_count % inference_every == 0 and not busy:
            with state_lock:
                inference_busy = True
            t = threading.Thread(
                target=run_inference_thread,
                args=(app, frame.copy()),
                daemon=True,
            )
            t.start()

        # Maybe write a DB row (respects SAVE_EVERY_SECONDS cooldown)
        maybe_save_to_db(conn)

        # Build display frame
        with state_lock:
            faces_snapshot = list(latest_faces)
            ms_snapshot    = inference_ms

        display = draw_overlay(frame, faces_snapshot, current_fps, ms_snapshot, inference_every)
        cv2.imshow("Smart Audience Analysis — Pipeline", display)

        # Key handling
        key = cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):        # Q or Esc
            break
        elif key == ord("s"):
            ts   = time.strftime("%Y%m%d_%H%M%S")
            path = os.path.join(SCREENSHOT_DIR, f"pipeline_{ts}.jpg")
            cv2.imwrite(path, display)
            print(f"[S] Screenshot: {path}")
        elif key in (ord("+"), ord("=")):
            inference_every = max(1, inference_every - 5)
            print(f"[+] Inference every {inference_every} frames")
        elif key == ord("-"):
            inference_every = min(120, inference_every + 5)
            print(f"[-] Inference every {inference_every} frames")

    # Cleanup
    cap.release()
    conn.close()
    cv2.destroyAllWindows()
    print("\n[*] Pipeline stopped. Goodbye.")


if __name__ == "__main__":
    main()
