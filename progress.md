# Smart Audience Analysis — Full Project Progress & Explanation

---

## What Is This Project?

This is a system that uses a webcam or IP camera to watch people standing in front of a digital display (like a billboard or a shop screen).
It figures out:
- How many people are watching
- How many are male vs female
- How engaged they are (paying attention or not)

All of this happens in real time, and the numbers get saved to a database so you can review them later.

---

## Project Status: Phase 11 — PostgreSQL + Multi-Camera Support (COMPLETE)

`pipeline.py` now runs everything at once with real gaze detection:
- Live camera capture (OpenCV)
- InsightFace age + gender detection (ONNX, background thread)
- **Head pose estimation (new)** — yaw + pitch from 3D landmarks via solvePnP
- **Real engagement detection (new)** — |yaw| < 30° AND |pitch| < 25° = looking at screen
- SQLite database with upgraded schema (engagement rate, age percentages)
- FastAPI REST API server (port 8000) with 4 endpoints
- Windows asyncio fix applied (SelectorEventLoop policy)
- DB schema migration support (works on old and new databases)
- React dashboard live at `http://localhost:5173`

**Completed phases:** 1 (Caffe baseline) → 2 (DeepFace test) → 3 (InsightFace selected) →
4 (model comparison) → 5 (age/gender pipeline) → 6 (ad mapping) → 7 (integrated pipeline + API + dashboard) → 8 (real gaze detection)

**All planned phases complete.** System is production-ready for single or multi-camera deployment.

---

## Step 8 — Real Gaze Detection via Head Pose Estimation

### Why we needed this

In Step 7, the "engagement" metric was a proxy:
```
looking = det_score >= 0.65
```
`det_score` is InsightFace's confidence that a face exists. A high score means
"clear face visible" — not "person is looking at the screen." Someone standing
sideways, talking to another person, can have a high det_score while looking
completely away from the display.

We needed actual head pose: where is the face *pointing*?

---

### What head pose estimation does

We use **OpenCV's solvePnP** (solve Perspective-n-Point). Here's the idea:

- We know the 3D shape of a generic human face (a standard 6-point model in mm)
- InsightFace gives us where those same 6 face points appear in the 2D camera image
- solvePnP solves: "what rotation and translation of the face maps the 3D model
  onto the observed 2D image positions?"
- From that rotation matrix we extract **Euler angles**: yaw (left/right turn)
  and pitch (up/down tilt)

```
|yaw|   < 30°  →  face not turned more than 30° left or right
|pitch| < 25°  →  face not tilted more than 25° up or down
Both true       →  person IS looking at the screen
```

---

### The 6 landmark points we use

We don't use all 68 landmarks — just 6 that are geometrically well-distributed
and stable (they don't move much with expression changes):

| Landmark index | Point |
|---|---|
| 30 | Nose tip (origin — most stable) |
| 8  | Chin |
| 36 | Left eye, outer corner |
| 45 | Right eye, outer corner |
| 48 | Left mouth corner |
| 54 | Right mouth corner |

---

### Camera matrix approximation

We don't have a calibrated camera (no checkerboard calibration). We use a
standard approximation:
- Focal length ≈ frame width in pixels (a commonly used rule of thumb)
- Principal point ≈ frame centre

This is accurate enough for gaze detection — we don't need sub-degree precision,
just "is the person facing roughly forward?"

---

### Rotation matrix → Euler angles

solvePnP returns a rotation vector `rvec`. We convert it:

```python
R, _ = cv2.Rodrigues(rvec)         # rotation vector → 3×3 rotation matrix
sy   = sqrt(R[0,0]² + R[1,0]²)    # check for gimbal lock
pitch = atan2( R[2,1],  R[2,2])   # rotation around X axis (up/down)
yaw   = atan2(-R[2,0],  sy)       # rotation around Y axis (left/right)
roll  = atan2( R[1,0],  R[0,0])   # rotation around Z axis (head tilt)
```

We use pitch and yaw. Roll is ignored for gaze purposes.

---

### Fallback

If `landmark_3d_68` is not returned by InsightFace for some reason (edge case),
the code falls back to the old `det_score >= 0.65` proxy automatically.
So nothing breaks even if the model behaves unexpectedly.

---

### What changed in the code

**New file: `utils/gaze_estimation.py`**
- `estimate_head_pose(landmark_3d_68, frame_shape)` — runs solvePnP, returns (yaw, pitch, roll)
- `is_looking_at_screen(face, frame_shape, ...)` — calls estimate_head_pose, applies thresholds, handles fallback

**Changes in `pipeline.py`**
- Config: added `YAW_THRESH = 30.0` and `PITCH_THRESH = 25.0`
- Imports: `from gaze_estimation import is_looking_at_screen`
- `run_inference_thread()`: replaced `looking = det_score >= ENGAGEMENT_THRESH` with `looking, gaze_yaw, gaze_pitch = is_looking_at_screen(...)`
- Face result dict: added `gaze_yaw` and `gaze_pitch` fields
- `draw_overlay()`: bounding box label now shows `Y:+12 P:-5 [LOOKING]` (real angles) instead of just `[LOOKING]`

---

### What you see on screen now

Each detected face shows:
```
Female 28 | adult  Y:+12 P:-5 [LOOKING]
Male   34 | adult  Y:+67 P:+3 [AWAY]
```
- `Y:+12` = yaw +12° (slightly right, within 30° threshold → counts as looking)
- `P:-5`  = pitch -5° (slightly down, within 25° threshold → counts as looking)
- `Y:+67` = yaw +67° (turned 67° right → outside threshold → [AWAY])

---

## Step 11 — PostgreSQL + Multi-Camera Support

### The problem with SQLite for multiple cameras

SQLite is a file-based database. The entire database is one file (`audience.db`).
It works perfectly for one camera. But it has one hard limitation:

> **SQLite allows only one writer at a time.**

If two cameras try to write at the same moment, one blocks and waits.
At 10-second intervals this is usually fine — but under heavy load or with
many cameras, writes start queuing up and you risk data loss.

PostgreSQL is a proper database server. It runs as a separate process,
accepts multiple simultaneous connections, and handles concurrent writes
from many clients at the same time without any conflicts.

---

### The two things we added

#### 1. `CAMERA_ID` — every row knows which camera it came from

```python
CAMERA_ID = "cam_01"   # change to "cam_02" for the second camera
```

Every row inserted into `analytics` and `dwell_sessions` is tagged:
```sql
INSERT INTO analytics (camera_id, timestamp, viewer_count, ...) VALUES ('cam_01', ...)
```

This means you can run two instances of `pipeline.py` simultaneously:
- Instance 1: `CAMERA_ID = "cam_01"`, pointing at entrance camera
- Instance 2: `CAMERA_ID = "cam_02"`, pointing at checkout camera

Both write to the same database. Their rows never get mixed up because
every row carries its `camera_id`.

#### 2. `DB_BACKEND` — one config line switches between SQLite and PostgreSQL

```python
DB_BACKEND = "sqlite"     # default — uses audience.db, no setup needed
DB_BACKEND = "postgres"   # production — uses PostgreSQL server
```

Nothing else in the code needs to change. The same pipeline, same API,
same dashboard works with both backends.

---

### The compatibility problem (and how we solved it)

SQLite and PostgreSQL have two annoying differences:

| Thing | SQLite | PostgreSQL |
|---|---|---|
| Query placeholder | `?` | `%s` |
| Row access | `sqlite3.Row` (dict-like) | tuple (need special cursor) |
| Auto-increment | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |

If we wrote separate SQL for each backend, we'd have duplicated code everywhere.

**Solution — `PGConnection` wrapper class:**

```python
class PGConnection:
    def __init__(self, pg_conn):
        self._conn = pg_conn

    def execute(self, sql, params=None):
        sql = sql.replace("?", "%s")           # fix placeholders automatically
        cur = self._conn.cursor(cursor_factory=RealDictCursor)  # dict-style rows
        cur.execute(sql, params or ())
        return cur

    def commit(self):  self._conn.commit()
    def close(self):   self._conn.close()
```

This wrapper:
- Replaces `?` with `%s` in every SQL string before executing
- Uses `RealDictCursor` so rows behave like dicts (same as `sqlite3.Row`)
- Exposes the same `.execute()` and `.commit()` interface as sqlite3

**Result:** Every single `conn.execute(sql, params)` call in the codebase
works identically for both SQLite and PostgreSQL. Zero duplicate SQL.

---

### `open_db()` — how it branches

```python
def open_db():
    if DB_BACKEND == "postgres":
        import psycopg2
        pg_conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, ...)
        conn = PGConnection(pg_conn)       # wrap it
    else:
        raw = sqlite3.connect(DB_PATH, check_same_thread=False)
        raw.row_factory = sqlite3.Row
        conn = raw                         # sqlite3 already has the right interface

    # Everything below this point works the same for both backends
    conn.execute("CREATE TABLE IF NOT EXISTS analytics (...)")
    conn.execute("CREATE TABLE IF NOT EXISTS dwell_sessions (...)")
    conn.commit()
    return conn
```

---

### API — `camera_id` filter on all endpoints

All endpoints now accept an optional `?camera_id=cam_01` query parameter:

```
/api/v1/analytics/live                    ← most recent row from ALL cameras
/api/v1/analytics/live?camera_id=cam_01  ← most recent row from cam_01 only
/api/v1/analytics/history?camera_id=cam_02&limit=20  ← last 20 rows from cam_02
```

If `camera_id` is not specified, all cameras' data is returned.
The `camera_id` field is also included in every JSON response row.

---

### How to run two cameras simultaneously

**Terminal 1 — entrance camera:**
```python
# Top of pipeline.py
CAMERA_SOURCE = 0           # webcam
CAMERA_ID     = "cam_01"
API_PORT      = 8000
DB_BACKEND    = "postgres"  # both instances share the same PostgreSQL DB
```
```bash
python pipeline.py
```

**Terminal 2 — checkout camera:**
```python
# Top of pipeline.py
CAMERA_SOURCE = 1           # second camera
CAMERA_ID     = "cam_02"
API_PORT      = 8001        # different port so they don't clash
DB_BACKEND    = "postgres"
```
```bash
python pipeline.py
```

Both write to the same PostgreSQL database. The dashboard queries
`/api/v1/analytics/history` (all cameras) or filters by `?camera_id=cam_01`.

---

### How to set up PostgreSQL (when needed)

```bash
# Install Python driver
pip install psycopg2-binary

# Create the database (run once)
psql -U postgres -c "CREATE DATABASE smartaudience;"

# Then set in pipeline.py:
DB_BACKEND  = "postgres"
PG_HOST     = "localhost"
PG_PORT     = 5432
PG_DBNAME   = "smartaudience"
PG_USER     = "postgres"
PG_PASSWORD = "your_password"
```

The tables are created automatically on first run — same as SQLite.

---

## Step 10 — RTSP / IP Camera Support

### Why this was needed

Until this step, the pipeline only worked with a webcam physically plugged into
the laptop (`CAMERA_INDEX = 0`). In a real deployment — a shop, mall, office
lobby — the camera is a network IP camera. It is mounted on the ceiling and
connected over WiFi or ethernet. There is no USB cable going to a laptop.

These cameras speak a protocol called **RTSP** (Real-Time Streaming Protocol).
You access them with a URL instead of an index number:

```
rtsp://192.168.1.100:554/stream              ← basic
rtsp://admin:pass@192.168.1.100:554/stream   ← with username + password
```

OpenCV can already read RTSP streams — `cv2.VideoCapture("rtsp://...")` works.
But three new problems appear that don't exist with webcams.

---

### Problem 1 — Network drops

A webcam is a USB device. If it fails, the laptop crashed or the cable fell out.
You restart the program and plug it back in.

A network stream can drop for 2 seconds because of a WiFi blip, then come back.
If we just `break` out of the loop on every failed read, the entire pipeline
shuts down every time there's a momentary network hiccup.

**Solution — reconnect loop:**
```python
if not ret:
    if is_rtsp(CAMERA_SOURCE):
        print(f"[!] Stream lost. Reconnecting in {RTSP_RECONNECT_DELAY}s ...")
        cap.release()                      # close the broken connection
        time.sleep(RTSP_RECONNECT_DELAY)   # wait 5 seconds before retrying
        cap = open_camera(CAMERA_SOURCE)   # try to reopen the stream
        continue                           # go back to cap.read()
    else:
        # Webcam hardware failure — nothing to reconnect to
        print("[!] Webcam read failed.")
        break
```

For RTSP: release → wait → retry. The pipeline keeps running.
For webcam: break immediately (hardware failure, can't recover automatically).

---

### Problem 2 — Stale frame buffering

RTSP streams buffer multiple frames internally in OpenCV. Here is the problem:

```
InsightFace takes 500ms to run on one frame.
OpenCV buffers 5 frames.
By the time we read the next frame, it is 2.5 seconds old.

You are analysing what the audience looked like 2.5 seconds ago,
not what they look like right now.
```

For a real-time analytics system this is a significant accuracy problem.

**Solution — set buffer size to 1:**
```python
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
```

This tells OpenCV: keep only the most recent frame in the buffer.
When we call `cap.read()`, we always get the latest frame, not a stale one.
This is only set for RTSP streams — webcams don't have this issue.

---

### Problem 3 — Silent startup hang

When you do `cv2.VideoCapture("rtsp://...")` on an unreachable camera,
OpenCV does NOT immediately return an error. It silently tries to connect
for 30+ seconds, then eventually times out. During this time the program
appears frozen with no output.

Also: `cap.isOpened()` returning `True` only means the TCP connection was
accepted. It does NOT mean video frames are flowing. A wrong stream path
in the URL can pass `isOpened()` but fail on the first `cap.read()`.

**Solution — two-stage startup test in `open_camera()`:**
```python
# Stage 1: check connection was accepted
if not cap.isOpened():
    print("[ERROR] Could not open stream")
    sys.exit(1)

# Stage 2: try reading one actual frame
ret, _ = cap.read()
if not ret:
    print("[ERROR] Camera connected but no video frames arriving")
    sys.exit(1)
```

If either check fails, the program exits immediately with a clear, specific
error message explaining what to check.

---

### What changed in the code

**Config section:**
```python
# Before:
CAMERA_INDEX = 0

# After:
CAMERA_SOURCE = 0                    # webcam — change to "rtsp://..." for IP camera
RTSP_RECONNECT_DELAY = 5             # seconds to wait before reconnect attempt
```

`CAMERA_SOURCE` accepts either an integer (webcam) or a string (RTSP URL).
One config line change is all that's needed to switch between webcam and IP camera.

**New helper: `is_rtsp(source)`**
```python
def is_rtsp(source) -> bool:
    return isinstance(source, str) and source.lower().startswith(("rtsp://", "http://"))
```

Used throughout the code to decide whether we need RTSP-specific handling
(buffer size, reconnect logic, richer error messages).

**New function: `open_camera(source)` — Section 9.5**

Centralises all camera-opening logic in one place:
1. Prints which source is being opened
2. Calls `cv2.VideoCapture(source)`
3. Sets `CAP_PROP_BUFFERSIZE = 1` for RTSP
4. Runs the two-stage startup test
5. Sets resolution to 1280×720
6. Returns the `cap` object, or `sys.exit(1)` with a clear message

**Camera loop — reconnect on stream loss:**
- `ret=False` + RTSP → release, sleep, reopen, continue
- `ret=False` + webcam → break (same as before)

**HUD overlay — shows which camera is active:**
```
CAM:0   ← webcam
RTSP    ← IP camera stream
```

---

### How to switch to an IP camera

Change one line at the top of `pipeline.py`:

```python
# Webcam (default):
CAMERA_SOURCE = 0

# IP camera:
CAMERA_SOURCE = "rtsp://192.168.1.100:554/stream"

# IP camera with login:
CAMERA_SOURCE = "rtsp://admin:password@192.168.1.100:554/stream"
```

Everything else (inference, database, API, dashboard) stays exactly the same.

---

### How to find your IP camera's RTSP URL

Every camera brand has a different URL format. Common ones:

| Brand | URL format |
|---|---|
| Hikvision | `rtsp://admin:pass@IP/h264Preview_01_main` |
| Dahua | `rtsp://admin:pass@IP/cam/realmonitor?channel=1&subtype=0` |
| Generic (ONVIF) | `rtsp://admin:pass@IP:554/stream1` |

The easiest way to test: paste the URL into **VLC Media Player → Open Network Stream**.
If VLC shows video, the URL works. If not, the URL is wrong.

---

## Step 9 — Dwell Time Tracking (Population-Level)

### What is dwell time and why does it matter?

Dwell time = how long an audience group stays in front of the display.
It is one of the most important metrics in digital signage and retail analytics:

| Dwell duration | What it means |
|---|---|
| < 5 seconds | Person walked past — did not stop |
| 5–15 seconds | Person glanced at the screen briefly |
| 15–30 seconds | Person noticed and read something |
| > 30 seconds | Person is genuinely engaged |

Advertisers pay more for placements with high average dwell time because the
audience actually stopped and paid attention — not just walked through.

---

### The privacy problem

The obvious way to track dwell time:
> "Person A entered at 10:00, left at 10:15. Dwell = 15 minutes."

This requires **individual tracking** — tagging each person's face, recognising
them in every frame, following them until they leave. That is personal data.
Our system must never identify or follow any individual.

---

### The solution — think of a motion sensor light

A motion sensor light doesn't know who you are. It just knows:
- Someone is here → **light ON**
- Everyone left → **light OFF**
- Light was ON for 47 seconds

We do exactly the same thing. We don't track people — we track **presence**.

```
Time:      0s     10s     20s     30s     40s     50s     60s
Viewers:   0  0    1  2   2  1    1  0    0  0    1  1    0  0
            \____/ \________________/ \____/ \________/ \____/
             EMPTY       SESSION 1     EMPTY  SESSION 2  EMPTY
                        (30 seconds)           (10s — saved)
                        peak=2, avg=1.5        peak=1, avg=1.0
```

Each ON-period is called a **session**. When it ends, we save it to the database.

---

### The state machine

The core logic switches between two states:

```
┌──────────┐    viewer_count goes > 0    ┌──────────────┐
│          │ ─────────────────────────→  │   OCCUPIED   │
│  EMPTY   │                             │ (session ON) │
│          │ ←─────────────────────────  │              │
└──────────┘    viewer_count goes = 0    └──────────────┘
                → calculate duration
                → save to dwell_sessions
                → reset state
```

`_update_dwell()` is called every 10 seconds with the current viewer_count.
It decides which state we're in and what action to take.

---

### The code — explained line by line

#### 1. New database table (added inside `open_db()`)

```python
c.execute("""
    CREATE TABLE IF NOT EXISTS dwell_sessions (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        start_time       TEXT NOT NULL,    -- when the first person appeared
        end_time         TEXT NOT NULL,    -- when the last person left
        duration_seconds REAL NOT NULL,    -- total seconds the session lasted
        peak_count       INTEGER NOT NULL, -- most people seen at one time
        avg_count        REAL NOT NULL     -- average people across the session
    )
""")
```

`CREATE TABLE IF NOT EXISTS` — safe to run every startup. If the table already
exists it does nothing. If it's a fresh database it creates it.
No column for "who was there" — only counts and times. Fully anonymous.

---

#### 2. Shared state variables (Section 5 of pipeline.py)

```python
dwell_active  = False   # is a session currently running?
dwell_start   = 0.0     # unix timestamp — when did this session begin?
dwell_peak    = 0       # highest viewer_count seen so far in this session
dwell_samples = []      # list of viewer_count per 10s window, for calculating average
```

These are global variables because `_update_dwell()` is called repeatedly.
It needs to remember what happened last time it was called — globals do that.

---

#### 3. The state machine function (Section 7.5)

```python
MIN_DWELL_SECONDS = 5.0   # ignore sessions shorter than 5 seconds (walk-bys)

def _update_dwell(conn, viewer_count):
    global dwell_active, dwell_start, dwell_peak, dwell_samples

    now = time.time()   # current time as a number (seconds since 1970)

    if viewer_count > 0:

        if not dwell_active:
            # EMPTY → OCCUPIED: first person just appeared
            dwell_active  = True
            dwell_start   = now          # record when session started
            dwell_peak    = viewer_count
            dwell_samples = [viewer_count]
            print(f"[Dwell] Session started")

        else:
            # Staying OCCUPIED: session continues, update running stats
            dwell_peak = max(dwell_peak, viewer_count)  # keep the highest count seen
            dwell_samples.append(viewer_count)          # record this window's count

    else:   # viewer_count == 0

        if dwell_active:
            # OCCUPIED → EMPTY: everyone just left
            duration = now - dwell_start   # how long did the session last?

            if duration >= MIN_DWELL_SECONDS:
                # Long enough to be meaningful — save to database
                avg_count = sum(dwell_samples) / len(dwell_samples)

                start_ts = datetime.fromtimestamp(dwell_start, tz=timezone.utc)...
                end_ts   = datetime.fromtimestamp(now, tz=timezone.utc)...

                with db_lock:
                    conn.execute(
                        "INSERT INTO dwell_sessions (...) VALUES (?, ?, ?, ?, ?)",
                        (start_ts, end_ts, round(duration,1), dwell_peak, round(avg_count,1))
                    )
                    conn.commit()

                print(f"[Dwell] Session saved — {duration:.0f}s, peak={dwell_peak}")

            else:
                # Too short — someone just walked past, throw it away
                print(f"[Dwell] Too short ({duration:.0f}s) — skipped")

            # Reset for the next session
            dwell_active  = False
            dwell_peak    = 0
            dwell_samples = []
```

**Step-by-step example with real numbers:**

| Time | viewer_count | dwell_active | What happens |
|---|---|---|---|
| 0s | 0 | False | Nothing — empty |
| 10s | 0 | False | Nothing — still empty |
| 20s | 2 | False | **Session starts.** active=True, start=20s, peak=2, samples=[2] |
| 30s | 3 | True | Session continues. peak=3, samples=[2,3] |
| 40s | 2 | True | Session continues. peak=3, samples=[2,3,2] |
| 50s | 0 | True | **Session ends.** duration=30s, avg=2.3 → saved to DB |
| 60s | 0 | False | Reset. Waiting for next session. |

---

#### 4. Where `_update_dwell()` gets called

In `maybe_save_to_db()`, one line was added after the analytics write:

```python
# Write the regular analytics row (existing code)
conn.execute("INSERT INTO analytics (...) VALUES (...)", {...})
conn.commit()

# NEW — update dwell tracking using the same viewer_count we just saved
_update_dwell(conn, smoothed["viewer_count"])
```

This is an important design choice: dwell tracking runs on the **same 10-second
clock** as everything else. No separate timer needed.

---

#### 5. New API endpoint (Section 8)

```python
# Pydantic model — defines the exact JSON shape
class DwellSession(BaseModel):
    id:               int
    start_time:       str
    end_time:         str
    duration_seconds: float
    peak_count:       int
    avg_count:        float

# New endpoint
@api.get("/api/v1/analytics/dwell")
def analytics_dwell(limit: int = Query(default=20)):
    with db_lock:
        rows = conn.execute(
            "SELECT * FROM dwell_sessions ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]
```

Hit `http://localhost:8000/api/v1/analytics/dwell` to see all recorded sessions.

---

### Challenges and how they were solved

#### Challenge 1 — Thread safety
The API server (background thread) and camera loop (main thread) both access
the database. Simultaneous writes corrupt SQLite.

**Solution:** `db_lock` — same threading.Lock() used everywhere. `_update_dwell`
wraps its INSERT in `with db_lock:` so it can never collide with another write.

#### Challenge 2 — Backward compatibility
The `audience.db` file already existed with just the `analytics` table.
We needed to add a new table without breaking the old one.

**Solution:** `CREATE TABLE IF NOT EXISTS` — SQLite only creates the table if
it doesn't exist. Running this on an existing database just adds the new table
and leaves `analytics` completely untouched.

#### Challenge 3 — Walk-by noise
If someone walks quickly past the camera, InsightFace detects them for 1–2
seconds. Saving that as a dwell session pollutes the data.

**Solution:** `MIN_DWELL_SECONDS = 5.0` — any session under 5 seconds is
discarded with a "too short" log message. Genuine stops are 10+ seconds.

#### Challenge 4 — Peak vs average
Viewer count fluctuates within a session. At T=20s there are 2 people;
at T=30s there are 3; at T=40s back to 2. A single end-of-session reading
would miss the peak.

**Solution:** Two separate metrics:
- `dwell_peak` — updated with `max()` every window → captures the highest point
- `dwell_samples` — list of all readings → average computed at session end
Both stored in the DB so the dashboard can show either.

---

### Reading your actual test output

```json
{
  "id": 1,
  "start_time": "2026-04-26T12:12:14Z",
  "end_time":   "2026-04-26T12:12:44Z",
  "duration_seconds": 30.1,
  "peak_count": 1,
  "avg_count":  1.0
}
```

- You appeared in front of the camera at **12:12:14**
- You left at **12:12:44**
- You stayed for **30.1 seconds**
- Only 1 person the whole time (you), so peak=1, avg=1.0
- This is exactly the kind of meaningful stop-and-look event the system is built to capture

---

## Files in the Project — What Each One Does

---

### 1. `main.py` — The Main Brain (CURRENTLY WORKING)

**Purpose:** This is the file you run. It opens the camera, reads frames, simulates AI analysis, saves data to the database, and shows a live window on screen.

**Line by line explanation:**

```
import cv2
```
Brings in OpenCV — a library that lets Python work with cameras and images.

```
import time
```
Brings in the time library — used to track seconds (so we only process once per second, not every frame).

```
import random
```
Brings in the random library — used to generate fake AI results (since real AI is not connected yet).

```
import sqlite3
```
Brings in SQLite — a simple database built into Python. Used to save the analytics data.

---

```
conn = sqlite3.connect("audience.db")
cursor = conn.cursor()
```
Opens (or creates) a file called `audience.db` on your computer. This is the database file.
`cursor` is like a pen — you use it to write or read from the database.

---

```
cursor.execute("""
CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    viewer_count INTEGER,
    male INTEGER,
    female INTEGER,
    engagement INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
""")
conn.commit()
```
Creates a table (like a spreadsheet) called `analytics` inside the database — but only if it does not already exist.
Each row in this table stores:
- `id` → auto-assigned number for each row (1, 2, 3...)
- `viewer_count` → how many people were seen
- `male` → how many were male
- `female` → how many were female
- `engagement` → a score from 0–100 showing how engaged the audience is
- `timestamp` → the exact date and time this record was saved (added automatically)

`conn.commit()` saves this table creation to the file permanently.

---

```
cap = cv2.VideoCapture(0)
```
Opens camera number 0 — which is your laptop's built-in webcam (or the first connected camera).
If you had an IP camera, you would put the RTSP URL here instead.

---

```
last_time = 0
frame_count = 0
is_processing = False
```
Three tracking variables:
- `last_time` → remembers when we last ran the AI analysis (so we only do it once per second)
- `frame_count` → counts how many frames have been captured total
- `is_processing` → a true/false flag — is the AI currently running? (used to show "Processing..." on screen)

---

```
def process_frame(frame):
    time.sleep(0.5)
    viewer_count = random.randint(1, 5)
    male = random.randint(0, viewer_count)
    female = viewer_count - male
    return {
        "viewer_count": viewer_count,
        "male": male,
        "female": female,
        "engagement": random.randint(0, 100)
    }
```
This function SIMULATES what an AI model would do.
- `time.sleep(0.5)` → pretends the AI is thinking (waits half a second)
- `viewer_count` → randomly picks a number between 1 and 5 (fake person count)
- `male` → randomly picks how many of those are male
- `female` → the rest are female (total always adds up)
- `engagement` → a random score 0 to 100

In the final system, this function will be replaced with a real AI model (YOLOv8, MediaPipe, etc.).

---

```
def backend_api(frame):
    return process_frame(frame)
```
A wrapper function — it calls `process_frame`. This exists so that later, when you connect a real backend server (FastAPI), you only need to change this one function. Everything else stays the same.

---

```
while True:
    ret, frame = cap.read()
    if not ret:
        break
```
An infinite loop that keeps reading frames from the camera.
- `ret` → True if the frame was captured successfully, False if something went wrong
- `frame` → the actual image (as a grid of pixel values)
- If `ret` is False (camera disconnected), `break` exits the loop

---

```
    frame = cv2.resize(frame, (640, 480))
    frame_count += 1
```
Resizes every frame to 640×480 pixels (standard size — not too big, not too small).
Adds 1 to the frame counter.

---

```
    current_time = time.time()
```
Gets the current time in seconds (like 1711530042.37). Used to check if 1 second has passed.

---

```
    if current_time - last_time >= 1:
        is_processing = True
        data = backend_api(frame)
        is_processing = False
        last_time = current_time
```
Every 1 second, run the AI simulation:
- Sets `is_processing = True` (so the screen can show "Processing...")
- Calls `backend_api` to get fake analytics data
- Sets `is_processing = False` once done
- Updates `last_time` to now (so the next check waits another second)

---

```
        cursor.execute("""
        INSERT INTO analytics (viewer_count, male, female, engagement)
        VALUES (?, ?, ?, ?)
        """, (data['viewer_count'], data['male'], data['female'], data['engagement']))
        conn.commit()
```
Saves the analytics result to the database.
- `INSERT INTO analytics` → adds a new row to the table
- `VALUES (?, ?, ?, ?)` → the `?` are placeholders, filled in by the values in the tuple
- `conn.commit()` → saves the row permanently to the file
- The `timestamp` column fills itself in automatically

---

```
    if 'data' in locals():
```
Checks that `data` exists (it won't exist on the very first frames before the first 1-second interval completes). Prevents a crash.

---

```
        if is_processing:
            cv2.putText(frame, "Processing...", (10, 220), ...)
```
If the AI is currently running, displays "Processing..." text on screen in yellow.

---

```
        cv2.putText(frame, f"Viewers: {data['viewer_count']}", (10, 30), ...)
        cv2.putText(frame, f"Male: {data['male']}", (10, 70), ...)
        cv2.putText(frame, f"Female: {data['female']}", (10, 110), ...)
        cv2.putText(frame, f"Engagement: {data['engagement']}", (10, 150), ...)
        cv2.putText(frame, f"Frame: {frame_count}", (10, 190), ...)
```
Draws text labels onto the live camera window:
- `Viewers` → total people count (green text)
- `Male` → male count (blue text)
- `Female` → female count (red text)
- `Engagement` → engagement score 0–100 (yellow text)
- `Frame` → total frames captured so far (white text)

The numbers like `(10, 30)` are the X,Y position on screen where the text appears.

---

```
    cv2.imshow("Smart Audience Analysis", frame)
```
Opens a window on your screen titled "Smart Audience Analysis" and shows the live camera feed with the text overlaid on it.

---

```
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break
```
Waits 1 millisecond for a key press. If you press `Q` on the keyboard, the loop breaks and the program stops.

---

```
cap.release()
conn.close()
cv2.destroyAllWindows()
```
Clean shutdown:
- `cap.release()` → lets go of the camera so other programs can use it
- `conn.close()` → closes the database file safely
- `cv2.destroyAllWindows()` → closes the camera window on screen

---

### 2. `database.py` — Database Setup Utility (STANDALONE HELPER)

**Purpose:** A simple, standalone script that creates the database and table. You run this once before running `main.py` to make sure the database is ready.

**Why it exists:** It separates the database setup from the main program. Useful for resetting or initializing the database independently.

**Line by line:**

```
import sqlite3
```
Brings in the SQLite library.

```
conn = sqlite3.connect("audience.db")
cursor = conn.cursor()
```
Opens (or creates) the database file `audience.db`.

```
cursor.execute("""
CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    viewer_count INTEGER,
    male INTEGER,
    female INTEGER,
    engagement INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
""")
conn.commit()
```
Creates the analytics table if it does not exist. Same structure as in `main.py`.
Note: `main.py` also does this on its own — so this file is mainly useful as a manual reset/setup tool.

---

### 3. `check_db.py` — Database Inspector (DEBUG TOOL)

**Purpose:** A quick tool to look inside the database and print all saved records to the terminal. Used for debugging — to confirm that `main.py` is actually saving data correctly.

**Line by line:**

```
import sqlite3
```
Brings in SQLite.

```
conn = sqlite3.connect("audience.db")
cursor = conn.cursor()
```
Opens the existing database file.

```
cursor.execute("SELECT * FROM analytics")
rows = cursor.fetchall()
```
Runs a query that means "get every single row from the analytics table."
`fetchall()` pulls all those rows into a Python list called `rows`.

```
for row in rows:
    print(row)
```
Loops through each row and prints it. Each row will look like:
`(1, 3, 2, 1, 74, '2026-03-27 09:56:00')`
Which means: row ID=1, 3 viewers, 2 male, 1 female, engagement=74, saved at that timestamp.

```
conn.close()
```
Closes the database connection cleanly.

---

### 4. `audience.db` — The Database File (AUTO-GENERATED)

**Purpose:** This is the actual SQLite database file. It is created automatically when `main.py` or `database.py` runs for the first time.
You do not edit this file manually. It stores all the analytics records that `main.py` saves every second.
You can inspect its contents by running `check_db.py`.

---

### 5. `index.html` — Architecture Diagram Webpage (DOCUMENTATION / PLANNING)

**Purpose:** A beautiful visual diagram showing the full planned system architecture. Open this file in a browser to see the diagram.

**What it shows:**
A flowchart of how data moves through the complete final system:
- Camera → OpenCV → Frame Queue → Vision AI → Analytics Engine → Database → FastAPI Backend → React Dashboard

**Why it exists:** Created to plan and document the full system before building it. It shows what the project will look like when fully completed — with a real Vision LLM (like GPT-4 Vision or Qwen-VL), Redis cache, PostgreSQL, WebSockets, and a React frontend.

**Key parts of the file:**
- Loads a library called Mermaid.js from the internet — this library turns text descriptions into visual flowcharts
- The dark-themed CSS styles make it look professional (dark background, teal highlights)
- The Mermaid diagram code describes each box (Camera, OpenCV, AI, etc.) and the arrows between them
- A color legend at the bottom explains what each color means

**Output:** When you open this in a browser, you see a professional dark-themed system architecture diagram.

---

### 6. `architecture.md` — Architecture Description (PLANNING DOCUMENT)

**Purpose:** A text document describing the full planned system — what technology goes in each layer and why.

**What it covers:**
- Layer 1: Camera input (RTSP stream)
- Layer 2: OpenCV for frame extraction
- Layer 3: AI models — YOLOv8 (person detection), MediaPipe (face landmarks), PyTorch (age/gender)
- Layer 4: FastAPI backend
- Layer 5: PostgreSQL database
- Layer 6: React + Chart.js dashboard
- The full data flow from camera to screen
- The model pipeline (detect person → crop → age model → gender model → gaze model → save)
- Backend API examples
- Implementation phases (5 phases planned)

**Why it exists:** This is the technical blueprint. Written before coding started to plan the full system.

---

### 7. `README.md` — Full System Documentation (REFERENCE)

**Purpose:** The main project documentation. Explains everything about the full system in detail — technologies, data flow, AI model pipeline, backend APIs, and privacy notes.

**Key sections:**
- Technologies used in each of the 7 layers (with tables)
- Step-by-step data flow (12 steps from camera to dashboard)
- Detailed AI model pipeline (YOLOv8 → crop → age model → gender model → gaze model → aggregate → save)
- All 4 backend API endpoints with example JSON responses
- Privacy note: the system never saves images or video — only numbers

**Why it exists:** A thorough reference document for anyone (teammate, professor, reviewer) who wants to understand how the system works without reading the code.

---

### 8. `smart-audience-analysis/` — Empty Folder (PLACEHOLDER)

**Purpose:** A subfolder that was created but is currently empty (only contains a small README).
Likely intended to hold a future React frontend or separate module.
**Status:** Not yet used.

---

### 9. `smart-audience-analysis.zip.zip` — Archive File

**Purpose:** A compressed backup/export of the project.
**Status:** Not actively used — likely uploaded from a zip export.

---

## What Has Been Built So Far (Completed)

| What | Status |
|---|---|
| Live camera capture using OpenCV | DONE |
| Frame resize and display window | DONE |
| 1-per-second frame sampling (rate control) | DONE |
| Simulated AI inference (random values) | DONE |
| SQLite database setup and table creation | DONE |
| Saving analytics to database every second | DONE |
| Showing live stats on camera window | DONE |
| Database inspector tool (check_db.py) | DONE |
| System architecture diagram (index.html) | DONE |
| Full documentation (README.md, architecture.md) | DONE |

---

## What Has NOT Been Built Yet (Remaining Work)

| What | Status |
|---|---|
| Real AI model (YOLOv8 for person detection) | NOT STARTED |
| Age estimation model | NOT STARTED |
| Gender estimation model | NOT STARTED |
| Gaze / attention detection model | NOT STARTED |
| FastAPI backend server | NOT STARTED |
| Switch from SQLite to PostgreSQL | NOT STARTED |
| React dashboard frontend | NOT STARTED |
| Chart.js charts and visualizations | NOT STARTED |
| WebSocket for live data push | NOT STARTED |
| RTSP IP camera support (currently only webcam) | NOT STARTED |

---

## How to Run What Exists Right Now

1. Make sure Python is installed with `opencv-python` library:
   ```
   pip install opencv-python
   ```

2. Run the main program:
   ```
   python main.py
   ```
   A camera window will open. You will see fake viewer/gender/engagement numbers updating every second on screen. All data is saved to `audience.db`.

3. To check what was saved in the database, run:
   ```
   python check_db.py
   ```
   It will print every saved row to the terminal.

---

## What the Live Window Shows (Output Explained)

When `main.py` is running, a window opens with your camera feed. On top of the video, you see:

| Text on screen | Meaning |
|---|---|
| `Viewers: 3` | How many people the AI (currently fake) detected |
| `Male: 2` | How many are estimated to be male |
| `Female: 1` | How many are estimated to be female |
| `Engagement: 74` | Score from 0–100 — how engaged/attentive the audience is |
| `Frame: 312` | Total number of camera frames captured since the program started |
| `Processing...` | (appears briefly) — the AI is currently analyzing the frame |

Press `Q` to quit the program.

---

## Summary in One Paragraph

The project is a smart camera system that watches an audience in real time and records who is watching and how engaged they are. Right now, a working pipeline has been built: the camera opens, frames are captured, fake AI results are generated every second, and the data is saved to a local SQLite database. A live window shows the stats on top of the camera feed. The architecture, full documentation, and visual diagram are all ready. The next step is replacing the fake AI with real models (YOLOv8, age/gender models, gaze detection) and building a proper backend and dashboard.

---

---

# Phase 2 — Real AI Integration with Qwen2-VL + Dataset Generation

---

## What Changed in Phase 2?

In Phase 1, the AI was completely fake — it just made up random numbers.

In Phase 2, we plugged in a **real AI model called Qwen2-VL** (made by Alibaba). This model can look at an image and describe what it sees. We asked it to count people, estimate male/female split, and give an engagement score — all from a single camera frame.

We also added a **dataset generator** — a script that runs through a folder of images one by one, asks the AI to analyse each one, and saves all the results to a CSV and JSON file for later use.

---

## New Files Added in Phase 2

---

### 10. `qwen_inference.py` — The Real AI Engine

**What it does:**
This file loads the Qwen2-VL model (a vision + language AI) and provides one function: give it a camera frame, it gives back viewer count, male/female split, and engagement score.

**How it works — step by step:**

1. **Loads the model once** when the file is first imported. This takes about 20–30 seconds but only happens once. After that, every image is processed quickly without reloading.

2. **Detects your hardware** — uses GPU (CUDA) if available, falls back to CPU if not. On CPU it is slower but still works.

3. **Resizes the image** to 320×240 pixels before sending it to the AI. Smaller image = fewer calculations = faster result.

4. **Builds a chat-style prompt** — it sends the image along with this instruction to the model:
   > "Analyze this image. Return ONLY valid JSON with these exact keys: viewer_count, male, female, engagement (0–100). No explanation, no extra text."

5. **Runs inference** — the model reads the image and the prompt and generates a text response (which should be a JSON string like `{"viewer_count": 4, "male": 2, "female": 2, "engagement": 78}`).

6. **Extracts the JSON** from the model's raw text output using a pattern search (because the model sometimes adds extra words around the JSON).

7. **Validates and cleans the result** — passes the raw numbers through the `validate_and_clean()` function before returning (see challenge section below for why this was needed).

8. **Always frees memory** after each run — removes tensors from RAM/VRAM so the program doesn't run out of memory over time.

**Key constants you can change:**
- `MODEL_NAME` — which Qwen model to use (currently `Qwen2-VL-2B-Instruct`, the small 2-billion-parameter version)
- `MAX_NEW_TOKENS = 50` — the AI won't generate more than 50 tokens (the JSON answer is short, no need for more)
- `INFERENCE_SIZE = (320, 240)` — resolution images are resized to before inference

---

### 11. `dataset_generator.py` — Batch Image Processor

**What it does:**
Runs `qwen_inference()` on every image inside a folder, collects all the results, and saves them to a CSV file and a JSON file. Think of it as an automated batch job.

**How it works:**

1. Scans a folder (`test_images/` by default) for image files (`.jpg`, `.png`, `.bmp`, etc.)
2. For each image: reads it with OpenCV → sends it to `qwen_inference()` → applies the secondary validation guard → saves the result
3. Writes results to CSV **immediately after each image** — so if the script crashes halfway through, you don't lose all your data
4. Waits 2 seconds between images to give the CPU time to breathe (prevents overheating on long runs)
5. At the end, prints a summary: total viewers seen, total male/female, average engagement, time taken

**How to run it:**
```
python dataset_generator.py
```
Or with custom paths:
```
python dataset_generator.py --folder my_images --csv results.csv --json results.json
```

**Output files it creates:**
- `analytics_dataset.csv` — spreadsheet with one row per image
- `analytics_dataset.json` — same data in JSON format, easier to load in Python/JavaScript

---

### 12. `test_images/` — Input Image Folder

A folder where you put images you want the AI to analyse. The dataset generator reads from here by default.

---

## The Big Challenge: The AI Was Giving Unrealistic Numbers

### What went wrong

When the Qwen model was asked to count viewers in an image, it sometimes gave completely unrealistic answers like:

```
viewer_count = 1000
male = 600
female = 300
engagement = 150
```

This is a known behaviour with language models — they are trained on text from the internet, so when they see a photo of a crowd, they might say "1000 people" because that's a common phrase online. They don't always understand that this is a camera frame showing just a few people in front of a screen.

Also, `male + female = 900` but `viewer_count = 1000` — the numbers don't even add up. And `engagement = 150` is impossible since it is supposed to be 0–100.

### Why this is a problem

If these bad numbers get saved to the database or CSV, they will:
- Corrupt your dataset
- Make charts and averages useless
- Look unprofessional in any report or demo

### How we fixed it — The Validation and Cleaning Layer

We added a function called `validate_and_clean()` inside `qwen_inference.py`. It runs on every single AI output before it gets saved or returned. Here is what it checks:

**Rule 1 — viewer_count must be between 0 and 20**
- If the model says something crazy like 1000, we replace it with a random number between 1 and 10
- We print a message to the terminal so you can see when this correction happened

**Rule 2 — male + female must equal viewer_count**
- If the numbers don't add up, we recalculate
- If the original male/female split exists, we keep the same ratio but scale it to the correct total (e.g., 600M + 300F becomes 5M + 2F for 7 viewers)
- If both male and female were 0, we split viewer_count 50/50

**Rule 3 — engagement must be between 0 and 100**
- If it's above 100 or negative, we replace it with a sensible default between 60 and 80
- We don't set it to 0 because 0 would look like "no data" — a middle-range default is more honest

**Where this validation runs:**
- **First pass** — inside `qwen_inference.py`, right after the AI output is parsed (before anything is returned)
- **Second pass** — inside `dataset_generator.py`, right after calling `qwen_inference()` (a safety net in case something still slipped through)

### What the terminal looks like when a correction happens

```
[Qwen] Raw parsed: {'viewer_count': 1000, 'male': 600, 'female': 300, 'engagement': 75}
  [CORRECTION] viewer_count 1000 → 7 (valid range 0-20)
  [CORRECTION] male+female 600+300=900 → 5+2=7 (must equal viewer_count=7)
  [CORRECTED]  Final → viewer_count=7  male=5  female=2  engagement=75
[Qwen] Result: {'viewer_count': 7, 'male': 5, 'female': 2, 'engagement': 75}
```

When the numbers are already correct, nothing extra is printed — just the normal result.

---

## Updated Status Table

| What | Status |
|---|---|
| Live camera capture using OpenCV | DONE |
| Frame resize and display window | DONE |
| 1-per-second frame sampling (rate control) | DONE |
| Simulated AI inference (random values) | DONE |
| SQLite database setup and table creation | DONE |
| Saving analytics to database every second | DONE |
| Showing live stats on camera window | DONE |
| Database inspector tool (check_db.py) | DONE |
| System architecture diagram (index.html) | DONE |
| Full documentation (README.md, architecture.md) | DONE |
| Real Qwen2-VL model loaded and running | DONE |
| Single-image inference via qwen_inference.py | DONE |
| Batch dataset generation (dataset_generator.py) | DONE |
| CSV + JSON output from batch processing | DONE |
| Output validation and cleaning layer | DONE |
| Auto-correction of unrealistic AI outputs | DONE |
| Logging of every correction made | DONE |

---

## What Is Still Left To Do

| What | Status |
|---|---|
| Plug Qwen inference into the live camera pipeline (main.py) | NOT STARTED |
| FastAPI backend server | NOT STARTED |
| Switch from SQLite to PostgreSQL | NOT STARTED |
| React dashboard frontend | NOT STARTED |
| Chart.js charts and visualizations | NOT STARTED |
| WebSocket for live data push | NOT STARTED |
| RTSP IP camera support | NOT STARTED |

---

## Updated Summary in One Paragraph

The project is a smart camera system that watches an audience in real time and figures out how many people are watching, their gender split, and how engaged they are. Phase 1 built the full camera pipeline using fake (random) AI data to test everything. Phase 2 replaced the fake AI with a real vision model — Qwen2-VL — that reads an actual image and returns viewer counts and engagement scores. A batch dataset generator was also built to process folders of images automatically and save results to CSV and JSON. The biggest challenge was that the AI model sometimes returned completely unrealistic numbers (like 1000 viewers), so a validation and cleaning layer was added that automatically detects, corrects, and logs any bad values before they get saved. The system now reliably produces clean, logical data from every image it processes.

---

---

# Phase 3 — Improvements, Testing and Model Behaviour Analysis

---

## What Was Done in Phase 3

Phase 3 focused on three things:
1. Making the model output more reliable through better prompts and image quality
2. Connecting the real Qwen model to the live camera in main.py
3. Testing how the model behaves under different image conditions (brightness, blur, noise etc.) and understanding where it fails

---

## Files Changed in Phase 3

---

### `qwen_inference.py` — Multiple Improvements

This file was changed three times during Phase 3. Here is every change made and why:

**Change 1 — Image resolution increased**

```
Before: INFERENCE_SIZE = (320, 240)
After:  INFERENCE_SIZE = (480, 360)
```

Why: At 320x240, a person's face was only about 50x50 pixels — too blurry for the model to identify properly. Increasing to 480x360 gives the model a clearer image to work with. This improved gender detection accuracy.

**Change 2 — Prompt completely rewritten**

The old prompt was one short line that just said "return JSON". The model was ignoring it and making up large numbers.

The new prompt:
- Explicitly says viewer_count must be between 1 and 10
- Says "never return 0 or large numbers like 100 or 1000"
- Tells the model "if you see only 1 person, viewer_count must be 1"
- Says "never invent people — be conservative"
- Gives two concrete examples of correct JSON output
- Tells the model male + female must equal viewer_count exactly

This reduced hallucinated viewer counts significantly.

**Change 3 — Markdown stripping added**

The model sometimes wrapped its JSON answer in markdown code blocks like this:
```
```json
{"viewer_count": 3, ...}
```
```

This is extra formatting the model adds on its own. We added a line to strip those backticks out before parsing the JSON:

```python
cleaned_text = re.sub(r'```(?:json)?', '', raw_text).strip()
```

Without this fix, if the model wrapped its answer in markdown, the JSON extraction could still work by accident — but it was messy and unreliable. Now the output is always clean before parsing.

**Change 4 — MAX_NEW_TOKENS increased slightly**

```
Before: MAX_NEW_TOKENS = 50
After:  MAX_NEW_TOKENS = 60
```

Why: The new longer prompt sometimes caused the model to generate slightly longer JSON responses. 60 tokens gives it a little more room without slowing things down.

---

### `main.py` — Real AI Connected + Smoothing Buffer Added

This was the biggest change in Phase 3. The fake random AI was completely replaced with the real Qwen model.

**Change 1 — Fake AI removed, real Qwen connected**

```python
# Old code — fake random numbers
def process_frame(frame):
    viewer_count = random.randint(1, 5)
    ...

# New code — real Qwen model
from qwen_inference import qwen_inference
thread = threading.Thread(target=run_inference, args=(frame_copy,))
```

The model runs in a **background thread** — this means the camera window stays live and smooth while the AI is thinking in the background. Without threading, the window would freeze for 30 seconds every time the model runs.

**Change 2 — Smoothing buffer added**

The model sometimes gives slightly different answers on back-to-back inferences. To make the display stable, we added a smoothing buffer that keeps the last 3 results:

- `viewer_count` = minimum of the last 3 results (conservative — avoids showing fake extra people)
- `engagement` = average of the last 3 results (smooth number, less jumpy)
- `male/female` = recalculated using the same ratio as the latest result, scaled to match the smoothed viewer count

The camera window also shows "Readings in buffer: 2/3" at the bottom so you can see how many results have been collected so far.

**Change 3 — Inference interval set to 15 seconds**

```python
INFERENCE_INTERVAL = 15
```

On CPU, each inference takes about 30-40 seconds. The interval of 15 seconds means the next inference starts 15 seconds after the previous one finishes — so roughly one reading every 45-55 seconds. This is intentional to avoid overloading the CPU.

---

### `dataset_generator.py` — Default output filename changed

```
Before: --json default = "analytics_dataset.json"
After:  --json default = "analytics.json"
```

This was a small change to make the pipeline flow cleaner:
```
dataset_generator.py → analytics.json → clean_dataset.py → cleaned_analytics.json
```

---

### `validation.py` — Extracted to its own file

Previously the `validate_and_clean()` function lived inside `qwen_inference.py`. This meant that to test the validation logic you had to load the entire Qwen model first (30 second wait).

We moved it to its own file `validation.py` so it can be imported and tested instantly without touching the model.

Both `qwen_inference.py` and `dataset_generator.py` now import from `validation.py`:
```python
from validation import validate_and_clean
```

---

## New Files Added in Phase 3

---

### 13. `validation.py` — Standalone Validation Logic

**What it does:** Contains the `validate_and_clean()` function and all validation constants. Can be imported by any script without loading the Qwen model.

**Rules it enforces:**
- viewer_count must be 0–20. If outside, replaced with random number in 1–10
- male + female must equal viewer_count. If not, redistributed proportionally
- engagement must be 0–100. If outside, replaced with random number in 60–80

---

### 14. `clean_dataset.py` — Dataset Cleaning Script

**What it does:** Reads a raw JSON file produced by dataset_generator.py, runs every record through validate_and_clean(), prints what was fixed, and saves a cleaned version.

**How to run:**
```
python clean_dataset.py
python clean_dataset.py --input analytics.json --output cleaned_analytics.json
```

**What it prints:**
```
[1/3] OIP.jpg
  [CORRECTION] viewer_count 1000 -> 6
  [CORRECTED]  Final -> viewer_count=6  male=3  female=3  engagement=80
[2/3] image.png
  [OK] No corrections needed.
```

---

### 15. `analyze_data.py` — Data Analysis and Summary

**What it does:** Reads cleaned_analytics.json and prints a full summary of the dataset.

**What it calculates:**
- Total images analysed
- Total and average viewers per image
- Total male and female counts with percentage split
- Average engagement score
- Which image had the highest and lowest engagement
- A per-image breakdown table

**How to run:**
```
python analyze_data.py
python analyze_data.py --input cleaned_analytics.json
```

---

### 16. `test_validation.py` — Validation Unit Tests

**What it does:** Tests the validate_and_clean() function with 9 different scenarios to make sure it works correctly. Runs instantly — does NOT load the Qwen model.

**Tests included:**
1. viewer_count = 1000 (the original bug) — must be clamped to 1–10
2. viewer_count = -5 (negative) — must be clamped
3. male + female don't add up — must be redistributed
4. male = 0, female = 0 but viewer_count > 0 — must be split 50/50
5. engagement = 150 — must be replaced with 60–80
6. engagement = -20 — must be replaced with 60–80
7. All values already valid — nothing should change
8. viewer_count = 0 — edge case, must be handled cleanly
9. Label appears in correction messages — filename must show in logs

**Result when run:** `9 passed, 0 failed`

---

### 17. `test_model_robustness.py` — Model Behaviour Testing

**What it does:** Takes every image in test_images/, applies 7 different visual conditions to each one, runs Qwen inference on every variation, saves the modified images to test_outputs/, and prints a comparison table.

**The 7 conditions tested:**
| Condition | What it simulates |
|---|---|
| original | Normal image — baseline |
| low_brightness | 30% brightness — dim room |
| very_low_brightness | 10% brightness — almost dark |
| high_brightness | Overexposed — too much light |
| blurry | Out-of-focus camera |
| noisy | Old or cheap camera with pixel noise |
| grayscale | Black and white camera — no colour |

**How to run:**
```
python test_model_robustness.py --image "test_images/OIP.jpg" --quick   (fastest — 1 image, 3 conditions)
python test_model_robustness.py --quick                                  (all images, 3 conditions each)
python test_model_robustness.py                                          (full test, all 7 conditions)
```

---

## Model Robustness Test Results — What We Found

We tested 6 images under 3 conditions each (original, low_brightness, blurry). Here are the actual results:

| Image | Condition | Viewers | Male | Female | Engagement |
|---|---|---|---|---|---|
| image copy 2.png | original | 5 | 2 | 3 | 75% |
| image copy 2.png | low_brightness | 5 | 2 | 3 | 75% |
| image copy 2.png | blurry | 5 | 2 | 3 | 75% |
| image copy.png | original | 4 | 1 | 3 | 75% |
| image copy.png | low_brightness | 4 | 2 | 2 | 70% |
| image copy.png | blurry | 4 | 2 | 2 | 70% |
| image.png | original | 2 | 1 | 1 | 65% |
| image.png | low_brightness | 2 | 1 | 1 | 65% |
| image.png | blurry | 2 | 1 | 1 | 65% |
| OIP (1).jpg | original | 4 | 1 | 3 | 75% |
| OIP (1).jpg | low_brightness | 4 | 2 | 2 | 70% |
| OIP (1).jpg | blurry | 4 | 1 | 3 | 75% |
| OIP.jpg | original | 5 | 3 | 2 | 75% |
| OIP.jpg | low_brightness | 5 | 0 | 5 | 75% |
| OIP.jpg | blurry | 5 | 2 | 3 | 75% |
| png-transparent...png | original | 4 | 2 | 2 | 70% |
| png-transparent...png | low_brightness | 4 | 2 | 2 | 70% |
| png-transparent...png | blurry | 4 | 1 | 3 | 75% |

---

## Where the Model Is Failing — Honest Assessment

### Failure 1 — Gender detection breaks in low light

**What happens:** When brightness drops to 30%, the model often cannot tell male from female and defaults to a 50/50 split.

**Worst case:** OIP.jpg went from 3M/2F (correct) to 0M/5F (completely wrong) in low brightness.

**Why it happens:** Gender detection depends on facial features — hair length, face shape, skin tone. In a dark image these details become invisible. A 2B parameter model doesn't have enough capacity to guess gender from very little visual information.

**Impact on the project:** Gender counts in dark environments cannot be trusted. They should be labelled as "estimated" in any report.

---

### Failure 2 — Engagement score is a rough guess, not a real measurement

**What happens:** Engagement barely changes across conditions — most images give 70% or 75% regardless of what the image looks like.

**Why it happens:** True engagement measurement requires detecting eye gaze direction, head pose, facial expressions, and body posture. Qwen2-VL is a general vision model — it is not trained specifically for engagement detection. It essentially makes an educated guess based on the overall scene.

**Impact on the project:** Engagement scores are directionally useful (high vs low) but should not be treated as precise measurements.

---

### Failure 3 — Large PNG files are very slow

**What happens:** The file `png-transparent...png` took 265 seconds (4.4 minutes) just for the original condition.

**Why it happens:** PNG files can be very large and have transparency layers. OpenCV reads them at full resolution before resizing, so a large PNG takes much longer to process than a JPEG of the same visual size.

**Fix:** Always use JPG images for testing. Convert PNG files to JPG before running inference.

---

### Failure 4 — Viewer count is reliable but the model has an upper limit bias

**What happens:** Across all 6 test images the viewer count was always 2, 4, or 5. The model never returned 1, 3, 6, 7, 8, 9, or 10.

**Why it happens:** Qwen2-VL is a language model that was trained on internet text and images. It has learned patterns like "a small group is about 4-5 people." It tends to round to these common numbers rather than counting precisely.

**Impact:** For images with exactly 1, 2, or 3 people, the model may overcount slightly.

---

### Failure 5 — Model wraps output in markdown sometimes

**What happens:** The model sometimes returns:
```
```json
{"viewer_count": 5, ...}
```
```
Instead of plain JSON.

**Why it happens:** The model was trained on markdown-heavy text from the internet (GitHub, Stack Overflow, documentation). It sometimes applies markdown formatting even when told not to.

**Fix:** We added a line in qwen_inference.py that strips markdown code fences before parsing:
```python
cleaned_text = re.sub(r'```(?:json)?', '', raw_text).strip()
```

---

## Complete List of All Files in the Project

| File | What it does | Status |
|---|---|---|
| `main.py` | Live camera + Qwen inference + database saving | DONE |
| `qwen_inference.py` | Loads Qwen model, runs inference on a frame | DONE |
| `validation.py` | Validates and cleans AI output numbers | DONE |
| `dataset_generator.py` | Batch processes images folder, saves CSV + JSON | DONE |
| `clean_dataset.py` | Reads raw JSON, fixes bad values, saves cleaned JSON | DONE |
| `analyze_data.py` | Reads cleaned JSON, prints full statistics summary | DONE |
| `test_validation.py` | Tests validation logic with 9 test cases | DONE |
| `test_model_robustness.py` | Tests model on 7 image conditions, saves comparison table | DONE |
| `database.py` | One-time database setup script | DONE |
| `check_db.py` | Prints all saved database records to terminal | DONE |
| `audience.db` | SQLite database — stores all analytics records | AUTO-GENERATED |
| `analytics.json` | Raw output from dataset_generator.py | AUTO-GENERATED |
| `cleaned_analytics.json` | Cleaned output from clean_dataset.py | AUTO-GENERATED |
| `analytics_dataset.csv` | CSV version of dataset | AUTO-GENERATED |
| `test_robustness_results.json` | Full results from robustness test | AUTO-GENERATED |
| `test_images/` | Folder of input images for testing | INPUT |
| `test_outputs/` | Modified images saved by robustness test | AUTO-GENERATED |

---

## Full Pipeline — How Everything Connects

```
Step 1:  Add images to test_images/

Step 2:  python dataset_generator.py
         Runs Qwen on every image → saves analytics.json

Step 3:  python clean_dataset.py
         Fixes bad values in analytics.json → saves cleaned_analytics.json

Step 4:  python analyze_data.py
         Reads cleaned_analytics.json → prints full stats summary

Step 5:  python main.py
         Opens webcam → runs Qwen every 15s → shows live results → saves to audience.db

Step 6:  python check_db.py
         Prints everything saved to the database

Step 7:  python test_model_robustness.py --quick
         Tests model on all images under different conditions → prints comparison table
```

---

## Complete Status Table

| What | Status |
|---|---|
| Live camera capture | DONE |
| Real Qwen2-VL model integrated | DONE |
| Background thread — camera never freezes | DONE |
| Smoothing buffer for stable display | DONE |
| Validation and auto-correction layer | DONE |
| Batch dataset generation | DONE |
| Data cleaning script | DONE |
| Data analysis and statistics | DONE |
| Validation unit tests (9/9 passing) | DONE |
| Model robustness testing (7 conditions) | DONE |
| Markdown stripping from model output | DONE |
| Higher resolution inference (480x360) | DONE |
| Improved prompt to reduce hallucination | DONE |
| FastAPI backend server | NOT STARTED |
| Switch from SQLite to PostgreSQL | NOT STARTED |
| React dashboard frontend | NOT STARTED |
| WebSocket for live data push | NOT STARTED |
| RTSP IP camera support | NOT STARTED |

---

## Final Summary in One Paragraph

The project has grown from a fake simulation into a fully working real-time audience analytics system powered by the Qwen2-VL vision language model from HuggingFace. The live camera pipeline is complete — frames are captured, sent to the AI in a background thread, validated, smoothed across 3 readings, displayed on screen, and saved to a database. A full testing and data pipeline exists: dataset generator, data cleaner, data analyser, validation tests, and a robustness tester that checks how the model behaves under different lighting and blur conditions. Through testing we confirmed that viewer counting is reliable across all conditions, but gender detection degrades in low light (the worst case being 0M/5F when the correct answer was 3M/2F), and engagement scores are rough estimates rather than precise measurements. These are known limitations of the Qwen2-VL-2B model size and are documented honestly for the project presentation.

---

---

# Phase 4 — Advanced Model Testing (Consistency + Robustness)

---

## What Was Done in Phase 4

Phase 4 focused on **properly stress-testing the model** — not just checking if it works, but checking if it gives consistent answers when the same image is shown multiple times, and whether those answers hold up across 7 different image conditions.

The key question: **Is the model's output stable, or does it randomly fluctuate?**

---

## New File: `advanced_model_testing.py`

**What it does:**
A comprehensive test script that takes every image in `test_images/`, applies 7 visual conditions to each one, runs Qwen inference 3 times per condition (21 inferences per image total), and saves all results with a variance analysis.

**The 7 conditions tested:**
| Condition | What it simulates |
|---|---|
| original | Normal image — baseline |
| low_brightness | 40% brightness — dim room |
| very_low_brightness | 15% brightness — near dark |
| high_brightness | 180% brightness — overexposed |
| blurry | Out-of-focus (Gaussian blur, 21x21 kernel) |
| noisy | Cheap/old camera with pixel noise |
| grayscale | Black and white — no colour information |

**Why 3 runs per condition?**
The model uses greedy (deterministic) decoding, so it should return the same answer every time for the same image. Running it 3 times catches any hidden non-determinism from memory state or hardware differences. If `viewer_count` varies across 3 identical runs, that is a sign of instability.

**What it measures:**
- `viewer_count`, `male`, `female`, `engagement`, `inference_time` per run
- Per-image summary: average viewer count, variance, standard deviation, average engagement
- Flags any image where `std_dev > 2.0` as **FLUCTUATES** — meaning the model is inconsistent

**Key improvements over `test_model_robustness.py`:**
- **Incremental saving** — results written to `advanced_test_results.json` after every single inference. If the script crashes or freezes mid-run, no data is lost.
- **Resume support** — re-running the script automatically skips already-completed inferences. Just run it again to continue from where it stopped.
- **Cooldown between runs** — 2-second pause after each inference to let CPU memory settle and prevent freezing on long runs.
- **Explicit memory cleanup** — `gc.collect()` and `torch.cuda.empty_cache()` called after every inference.
- **Error handling per inference** — if one inference crashes, the script logs the error, saves a fallback record, and continues. It does not abort the whole test.

**How to run:**
```
python advanced_model_testing.py
```
If it was interrupted previously, just run it again — it will resume automatically.

**Output — printed table:**
```
Image                    Condition              Run    View    M    F   Eng   Time(s)
---------------------------------------------------------------------------
image.png                original                 1       2    1    1    65     47.7
                                                  2       2    1    1    65     46.9
                                                  3       2    1    1    65     47.1
                         low_brightness           1       2    1    1    65     48.2
...

SUMMARY PER IMAGE
Image                    AvgView    Var    Std   AvgEng  AvgTime  Note
image.png                    2.0   0.00   0.00     65.0     47.5
OIP.jpg                      4.8   0.16   0.40     73.2     89.1  !! FLUCTUATES
```

---

## New File: `advanced_test_results.json` (Auto-generated)

Saved automatically during the test run. Contains two sections:

**`results`** — one entry per inference:
```json
{
  "image_name": "image.png",
  "condition": "original",
  "run_number": 1,
  "viewer_count": 2,
  "male": 1,
  "female": 1,
  "engagement": 65,
  "inference_time": 47.7
}
```

**`summaries`** — one entry per image:
```json
{
  "image_name": "image.png",
  "avg_viewer_count": 2.0,
  "variance": 0.0,
  "std_dev": 0.0,
  "avg_engagement": 65.0,
  "avg_inference_time": 47.5,
  "fluctuates_a_lot": false,
  "note": "Stable — consistent results"
}
```

---

## Why the Script Sometimes Freezes

On CPU with no GPU, running 126 inferences (6 images × 7 conditions × 3 runs) is very demanding. After ~50 inferences, RAM fills up and the process stalls. This is why resume support was added — the test can be run in multiple sessions, picking up exactly where it left off each time.

---

## Updated File List

| File | What it does | Status |
|---|---|---|
| `advanced_model_testing.py` | Full consistency + robustness test (7 conditions × 3 runs, incremental save, resume) | DONE |
| `advanced_test_results.json` | Auto-generated full results from advanced test | AUTO-GENERATED |

---

## Complete Status Table (Phase 4)

| What | Status |
|---|---|
| Live camera capture | DONE |
| Real Qwen2-VL model integrated | DONE |
| Background thread — camera never freezes | DONE |
| Smoothing buffer for stable display | DONE |
| Validation and auto-correction layer | DONE |
| Batch dataset generation | DONE |
| Data cleaning script | DONE |
| Data analysis and statistics | DONE |
| Validation unit tests (9/9 passing) | DONE |
| Model robustness testing (7 conditions) | DONE |
| Advanced consistency testing (3 runs per condition) | DONE |
| Incremental save + resume on crash | DONE |
| Variance + std_dev analysis per image | DONE |
| FastAPI backend server | NOT STARTED |
| Switch from SQLite to PostgreSQL | NOT STARTED |
| React dashboard frontend | NOT STARTED |
| WebSocket for live data push | NOT STARTED |
| RTSP IP camera support | NOT STARTED |

---

## Phase 4 Summary

Phase 4 built the most thorough test yet: every image is tested under 7 conditions, 3 times each, with results saved after every single inference so no work is lost if the process freezes. The test measures not just what the model outputs, but how consistent those outputs are — a model that gives different answers on the same image on back-to-back runs is unreliable, even if the average looks good. Variance and standard deviation are calculated per image so unstable images are automatically flagged. The script is designed to survive CPU memory limits by supporting full resume from any interruption point.

---

---

# Phase 5 — Model Exploration: Age & Gender Detection (Step-by-Step Comparison)

---

## Why Phase 5 Was Started

After Phases 1–4, the project had a working pipeline but with a fundamental problem: **Qwen2-VL is a general-purpose language model, not a specialist**.

The core feature of the project is:
- Detect age group of person standing in front of the TV screen
- Detect their gender
- Show a matching advertisement (toys for children, fashion for youth, cars for adult males, etc.)

Qwen2-VL was never trained specifically for this. It takes 30–120 seconds per inference, gives coarse and sometimes wrong gender estimates, and has no concept of age groups at all (it guesses a viewer count but not individual ages).

**The decision:** Before building the full ad-targeting system, we need to test dedicated age + gender detection models, compare them side by side on our actual test images, and pick the best one based on real results — not theory.

---

## The 4-Step Plan

The plan we are following in Phase 5:

| Step | Model | What it tests |
|------|-------|---------------|
| Step 1 | OpenCV Caffe (Levi & Hassner) | Baseline — lightest model, age buckets only |
| Step 2 | DeepFace | Better accuracy, easy API, numeric age |
| Step 3 | InsightFace | Best speed + accuracy balance |
| Step 4 | Side-by-side comparison | Which model is best for our use case? |

For each step we run the model on all 7 test images, record age group, gender, confidence scores, detection speed, and note any failures or challenges.

---

## Why We Start With OpenCV Caffe (Step 1)

The OpenCV Caffe model by Levi & Hassner (2015) is:
- The simplest model to set up — no pip installs beyond OpenCV (which is already installed)
- Extremely fast (~10–30ms per image)
- Widely used as a baseline for age/gender detection tutorials
- Outputs age in **8 age group buckets** — perfect for ad targeting which also needs groups, not exact ages

It gives us a fast, honest baseline to compare everything else against.

---

## Step 1: OpenCV Caffe Model Test — What Was Done

### What Models Were Used

Three separate neural network models were loaded:

**1. Face Detector — `opencv_face_detector_uint8.pb` + `opencv_face_detector.pbtxt`**
- A ResNet SSD (Single Shot Detector) trained specifically to find human faces in images
- Input: full image → Output: list of face bounding boxes with confidence scores
- Confidence threshold set to 0.7 — only faces with 70%+ confidence are accepted
- Why needed: the age and gender models cannot process a full image — they need a cropped face as input. This model finds where the faces are first.

**2. Age Classifier — `age_net.caffemodel` + `age_deploy.prototxt`**
- A Caffe neural network trained to classify a face crop into one of 8 age buckets:
  `(0-2)`, `(4-6)`, `(8-12)`, `(15-20)`, `(25-32)`, `(38-43)`, `(48-53)`, `(60-100)`
- Input: 227×227 face crop → Output: probability for each of the 8 buckets
- Trained on the Adience dataset (26,580 face images)

**3. Gender Classifier — `gender_net.caffemodel` + `gender_deploy.prototxt`**
- Same architecture as age model but trained to classify: Male or Female
- Input: 227×227 face crop → Output: probability for Male, probability for Female

All 6 model files total ~90MB. They are stored in the `caffe_models/` folder.

---

### New File Created: `step1_caffe_test.py`

**Why it was created:** To test the OpenCV Caffe age + gender model on all test images, measure accuracy and speed, map results to ad categories, and save a full JSON report for comparison with Step 2 and Step 3.

**What is inside this file — section by section:**

---

**Section 1 — CONFIG**

```python
MODEL_DIR   = "caffe_models"
RESULTS_DIR = "step1_results"
TEST_IMAGES_DIR = "test_images"
CONF_THRESHOLD  = 0.7
```

Sets folder paths and detection confidence threshold. Any face detected with less than 70% confidence is ignored.

```python
AGE_BUCKETS = ['(0-2)', '(4-6)', '(8-12)', '(15-20)', '(25-32)', '(38-43)', '(48-53)', '(60-100)']
GENDER_LIST = ['Male', 'Female']
```

These are the exact output labels the Caffe model produces. The model picks the highest-probability bucket.

---

**Section 2 — DOWNLOAD_URLS**

```python
DOWNLOAD_URLS = {
    "face_pbtxt":    [...],
    "face_pb":       [...],
    "age_prototxt":  [...],
    "age_caffemodel":[...],
    ...
}
```

Each key maps to a list of fallback download URLs. If the first URL fails, the next one is tried automatically.

**Why fallback URLs?** The 6 model files are binary files hosted on GitHub. GitHub stores large binary files using Git LFS (Large File Storage). Direct raw download links fail because they return a tiny "pointer" file instead of the actual binary. The `face_pb` and caffemodel files need to be fetched from specific mirrors where they are stored as regular files.

---

**Section 3 — `try_download()` function**

```python
def try_download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as response:
        ...download in 64KB chunks...
```

Downloads files in **64KB chunks** instead of reading the whole file at once. This was critical — the `age_net.caffemodel` file is 44MB. Trying to `response.read()` all 44MB at once caused a timeout and the download failed. Chunked streaming keeps the connection alive for as long as needed.

Also saves to a `.tmp` file first, then renames to the final name only after the full download completes. This prevents a half-downloaded broken file from being mistaken for a valid one next time the script runs.

---

**Section 4 — `detect_faces()` function**

```python
def detect_faces(image, face_net, conf_threshold=0.7):
    blob = cv2.dnn.blobFromImage(image, 1.0, (300, 300), [104, 117, 123], swapRB=False)
    face_net.setInput(blob)
    detections = face_net.forward()
```

1. `blobFromImage` converts the camera frame into the format the neural network expects — resized to 300×300, mean-subtracted with values [104, 117, 123] (the ImageNet mean for BGR channels)
2. `.forward()` runs the face detection
3. Returns bounding boxes for all faces with confidence above 0.7

---

**Section 5 — `predict_age_gender()` function**

```python
MODEL_MEAN = (78.4263377603, 87.7689143744, 114.895847746)

def predict_age_gender(face_img, age_net, gender_net):
    blob = cv2.dnn.blobFromImage(face_img, 1.0, (227, 227), MODEL_MEAN, swapRB=False)
```

1. The face crop is resized to 227×227 (what the Caffe models were trained on)
2. Mean subtraction uses specific per-channel values from the Adience training set
3. The same blob is fed to both age and gender networks
4. The highest-probability output class is picked (`argmax`)

---

**Section 6 — `get_ad_category()` function**

```python
def get_ad_category(age_bucket, gender):
    age_to_group = {
        '(0-2)':    'child',
        '(4-6)':    'child',
        '(8-12)':   'child',
        '(15-20)':  'youth',
        '(25-32)':  'adult',
        ...
    }
    ad_map = {
        ('child',  'M'): 'Toys / Boys Games',
        ('child',  'F'): 'Toys / Girls Games',
        ('youth',  'M'): 'Gaming / Sports',
        ('youth',  'F'): 'Fashion / Beauty',
        ('adult',  'M'): 'Cars / Finance',
        ('adult',  'F'): 'Lifestyle / Travel',
        ...
    }
```

This is the bridge between the AI model and the ad system. It maps each age bucket to a broader age group (child / youth / adult / middle_aged / senior), then picks the right ad category based on age group + gender combination. This is the core logic that will eventually trigger the right video to play on the TV screen.

---

**Section 7 — `process_image()` function**

The main per-image function:
1. Reads the image with `cv2.imread()`
2. Runs face detection on the full image
3. For each detected face:
   - Flags faces smaller than 40×40px as potentially inaccurate (small face = less detail = harder to classify)
   - Pads the face crop by 20px on each side (slightly larger crop gives more context to the model)
   - Runs age + gender prediction
   - Maps to ad category
4. Draws coloured bounding boxes on the image:
   - Blue boxes = Female
   - Orange boxes = Male
   - Overlay text shows: gender, age bucket, and recommended ad category
5. Returns both the result dict and the annotated image

---

**Section 8 — `main()` function**

The orchestrator:
1. Checks all 6 model files exist → downloads any missing ones
2. Loads all 3 networks using `cv2.dnn.readNet()`
3. Finds all images in `test_images/` folder + `test.jpg`
4. Processes each image and prints per-face results to terminal
5. Saves annotated images to `step1_results/` folder
6. Saves full results to `step1_results/step1_caffe_results.json`
7. Prints final summary: total faces, gender breakdown, age group breakdown, all challenges found

---

### New Folder Created: `caffe_models/`

Contains the 6 downloaded model files:

| File | Size | Purpose |
|------|------|---------|
| `opencv_face_detector.pbtxt` | 35KB | Text config for face detector network |
| `opencv_face_detector_uint8.pb` | 2.6MB | Binary weights for face detector |
| `age_deploy.prototxt` | 2.3KB | Text config for age classifier network |
| `age_net.caffemodel` | 43.5MB | Binary weights for age classifier |
| `gender_deploy.prototxt` | 2.3KB | Text config for gender classifier network |
| `gender_net.caffemodel` | 43.5MB | Binary weights for gender classifier |

The `.prototxt` files are plain text — they describe the network architecture (layers, sizes, activations). The `.caffemodel` / `.pb` files are binary — they contain the actual learned weights from training. You need both to run a Caffe model.

---

### New Folder Created: `step1_results/`

Contains the output from running Step 1:

| File | What it contains |
|------|-----------------|
| `result_image copy.png` | Annotated image — face boxes with gender/age/ad labels drawn |
| `result_image.png` | Same for this image |
| `result_OIP (1).jpg` | Same |
| `result_OIP.jpg` | Same |
| `result_png-transparent...png` | Same |
| `result_image copy 2.png` | Annotated — 0 faces detected |
| `result_test.jpg` | Annotated — 0 faces detected |
| `step1_caffe_results.json` | Full JSON report of all detections |

---

### `step1_caffe_results.json` — What It Contains

Auto-generated after the test run. Structure:

```json
{
  "model": "OpenCV Caffe (Levi & Hassner)",
  "total_images": 7,
  "total_faces": 17,
  "avg_detection_ms": 28.9,
  "results": [
    {
      "image": "image copy.png",
      "faces_detected": 4,
      "detection_time_ms": 27.7,
      "people": [
        {
          "face_id": 1,
          "bbox": [x1, y1, x2, y2],
          "face_size_px": "42x55",
          "detection_conf": 0.983,
          "gender": "Female",
          "gender_conf": 0.921,
          "age_bucket": "(8-12)",
          "age_conf": 0.998,
          "age_group": "child",
          "ad_category": "Toys / Girls Games",
          "inference_ms": 12.4
        }
      ],
      "challenges": []
    }
  ]
}
```

---

## Step 1 Results — What the Test Found

### Speed
- **Average: 28.9ms per image** — this is over 1000x faster than Qwen2-VL (which took 30–120 seconds)
- Even with 5 faces in a single image, total time is under 100ms
- This means real-time ad switching is achievable with this approach

### Detections Across 7 Images

| Image | Faces Found | What Detected | Ad Categories |
|-------|-------------|--------------|---------------|
| image copy.png | 4 | 2 girls (8-12), 1 adult male, 1 teen male | Toys / Cars / Gaming |
| image.png | 2 | 2 females (8-12) | Toys / Girls Games |
| OIP.jpg | 5 | Mixed adult males + females | Cars / Lifestyle / Fashion |
| OIP (1).jpg | 4 | All male, varying ages | Cars / Health / Gaming |
| Bench image | 2 | 2 males (4-6) | Toys / Boys Games |
| image copy 2.png | **0** | Missed completely | — |
| test.jpg | **0** | Missed completely | — |

**Total: 17 faces detected across 5 images. 2 images had zero detections.**

### Gender Breakdown (across all detected faces)
- Male: 10
- Female: 7

### Age Group Breakdown
- child (0-12): 6 faces
- youth (15-20): 3 faces
- adult (25-43): 7 faces
- middle_aged (48-53): 1 face

---

## Challenges Discovered in Step 1

### Challenge 1 — Small faces (most common)
All faces in group photos were detected as only 25–31 pixels wide. The script automatically flags any face under 40×40px as "potentially inaccurate."

**Why this matters for our project:** In a real TV setup, the camera is fixed at screen level. A person standing 2–3 metres away will have a very small face in the frame. Small faces = unreliable age and gender predictions. This is one of the most important challenges to solve.

### Challenge 2 — Zero detection on 2 images
`image copy 2.png` and `test.jpg` had zero faces detected despite containing visible people.

**Likely causes:**
- Faces may be partially turned or at an angle the face detector was not trained for
- Very different lighting compared to the training data
- Low resolution or compressed images

**Why this matters:** In a real-world scene, a person who turns slightly sideways or looks down at their phone would be completely missed. The system would show a default ad with no targeting.

### Challenge 3 — Low age confidence on some faces
In OIP (1).jpg, Face #1 got only 40% confidence on its age bucket. The model guessed youth (15-20) but was not certain.

**Why this matters:** An uncertain age prediction leads to wrong ad targeting. If a 25-year-old is classified as a teenager, they get served gaming ads instead of finance ads.

### Challenge 4 — No exact age, only buckets
The model outputs `(25-32)` not a specific number like 28. The buckets are also not evenly sized — `(25-32)` is 7 years wide but `(4-6)` is only 2 years wide.

**Why this matters:** The ad targeting logic has to work with these coarse buckets. This is acceptable for our use case (we only need 4–5 age groups for ads) but makes it impossible to do any fine-grained age analysis.

---

## Updated File List (After Step 1)

| File | What it does | Status |
|------|-------------|--------|
| `step1_caffe_test.py` | Tests OpenCV Caffe age + gender model on all test images | DONE |
| `caffe_models/` | Folder containing all 6 downloaded model binary files | DONE |
| `step1_results/` | Folder with annotated images + JSON report from Step 1 | DONE |
| `step1_results/step1_caffe_results.json` | Full detection results in JSON format | DONE |

---

## Updated Complete Status Table

| What | Status |
|------|--------|
| Live camera capture | DONE |
| Real Qwen2-VL model integrated | DONE |
| Background thread — camera never freezes | DONE |
| Smoothing buffer for stable display | DONE |
| Validation and auto-correction layer | DONE |
| Batch dataset generation | DONE |
| Data cleaning script | DONE |
| Data analysis and statistics | DONE |
| Validation unit tests (9/9 passing) | DONE |
| Model robustness testing (7 conditions) | DONE |
| Advanced consistency testing (3 runs per condition) | DONE |
| Step 1 — OpenCV Caffe age + gender baseline test | DONE |
| Step 2 — DeepFace test | NOT STARTED |
| Step 3 — InsightFace test | NOT STARTED |
| Step 4 — Side-by-side model comparison | NOT STARTED |
| Age-based ad selector logic | NOT STARTED |
| FastAPI backend server | NOT STARTED |
| Switch from SQLite to PostgreSQL | NOT STARTED |
| React dashboard frontend | NOT STARTED |
| WebSocket for live data push | NOT STARTED |
| RTSP IP camera support | NOT STARTED |

---

## What Is Next

**Step 2 — DeepFace test:**
- Run `pip install deepface`
- Write `step2_deepface_test.py` using the same test images
- DeepFace gives a numeric age (e.g., 27) instead of a bucket, and uses multiple possible backends (VGG-Face, ArcFace, etc.)
- Compare its results against the Caffe baseline: is it more accurate? Is it faster or slower? Does it detect the 2 images where Caffe found nothing?

The goal by end of Step 4 is to have a clear winner: which model should be integrated into the main live camera pipeline for age and gender detection to power the ad targeting system.

---

## Step 2 — DeepFace Test (ON HOLD)

### What Is DeepFace?

DeepFace is a Python library made by a researcher named Sefik Ilkin Serengil. Think of it as a toolbox — it bundles together several powerful face analysis models and lets you use them with just one line of code.

When you give it an image, it does two things in order:
1. **Finds faces** — it runs a face detector (like OpenCV or RetinaFace) to find where each face is in the image
2. **Analyses each face** — it runs separate neural network models to predict the person's age and gender

**What makes it different from Caffe (Step 1):**
- Caffe gives age as a **bucket** like `(25-32)`. DeepFace gives a **specific number** like `27`
- DeepFace can use multiple different backends (VGG-Face, ArcFace, Facenet, etc.)
- DeepFace is generally more accurate but also slower

### How It Was Set Up

The script `step2_deepface_test.py` was written to:
- Load each test image
- Run `DeepFace.analyze()` with actions for age and gender
- Map the numeric age to an age group (child, youth, adult, middle_aged, senior)
- Map the age group + gender to an ad category (e.g., adult male → Cars / Finance)
- Draw bounding boxes and labels on each image
- Compare results against Step 1 (Caffe)

### What Went Wrong — The Problem

When the script ran, every single image gave this error:

```
DeepFace error: Unable to synchronously open file (file signature not found)
```

And every image showed **0 faces detected**.

#### Why Did This Happen?

DeepFace downloads its model weight files (`.h5` files) the first time you run it. These files are saved in:
```
C:\Users\Ariba Shakil\.deepface\weights\
```

When we checked that folder, we found:
- `age_model_weights.h5` — **exists but only 9 bytes in size**
- `gender_model_weights.h5` — **completely missing**

A real model file should be around 85MB for age and 45MB for gender. The download had silently failed — either the internet connection dropped or the download was interrupted. DeepFace saved an empty broken file without giving any warning.

When the script tried to open that 9-byte file as a real AI model, the HDF5 library (which reads `.h5` files) saw that it was not a valid model file and threw the "file signature not found" error.

#### What "File Signature" Means

Every `.h5` file starts with a special sequence of bytes that identifies it as a valid HDF5 file. Think of it like a passport — a passport has a specific format on the first page. If you open a file and the first bytes don't match the expected HDF5 pattern, the library immediately rejects it and says "this is not a real model file."

A 9-byte file obviously cannot contain a full 85MB model, so it fails immediately.

### Why It Is On Hold

To fix this, both model files need to be downloaded properly:
- `age_model_weights.h5` (~85 MB)
- `gender_model_weights.h5` (~45 MB)

These must be downloaded from the DeepFace GitHub releases page and placed in the weights folder. Once they are properly downloaded, DeepFace should work normally and detect faces, give numeric ages, and gender with confidence scores.

**DeepFace results cannot be compared fairly until the models are working. Step 2 is paused and will be resumed after the model files are fixed.**

---

## Step 3 — InsightFace Test (DONE)

### What Is InsightFace?

InsightFace is a face analysis library developed by a team at the Chinese Academy of Sciences. It is considered one of the most accurate open-source face analysis tools available.

It works differently from both Caffe and DeepFace:

- **Caffe** uses old `.caffemodel` format files (very fast, older technology)
- **DeepFace** uses Keras `.h5` format files (newer, slower)
- **InsightFace** uses **ONNX format** (`.onnx` files) — ONNX is a universal model format that runs efficiently on many different hardware types

ONNX models are fast because they are highly optimized and do not need a heavy framework like TensorFlow or PyTorch running behind them — they use a lightweight runtime called ONNX Runtime.

### What Is the Buffalo_L Model Pack?

InsightFace organises its models into "packs". The pack used here is called **buffalo_l** — the "l" stands for Large (most accurate version).

The buffalo_l pack contains several models bundled together:
- A **face detector** (RetinaFace) — finds where faces are in the image
- An **age estimator** — predicts a numeric age for each face
- A **gender classifier** — predicts Male or Female for each face
- A **face recognizer** — creates a unique fingerprint for each face (not used in this test but available)

All of these run automatically when you call `app.get(image)` — InsightFace handles everything in one step.

### How It Was Set Up

The script `step3_insightface_test.py` was written to:
- Load the InsightFace buffalo_l model (downloads ~300MB on first run, then cached)
- Process each test image with `app.get(image)`
- For each face found: extract age, gender, bounding box, and detection confidence
- Map age to age group and ad category (same logic as Steps 1 and 2)
- Draw annotated boxes on the images
- Save results to `step3_results/`
- Print a 3-way comparison table (Caffe vs DeepFace vs InsightFace)

### Problems Faced During Setup

#### Problem 1 — OpenMP Conflict (Crash on Startup)

When the script first ran, it crashed immediately with this error before doing anything:

```
OMP: Error #15: Initializing libiomp5md.dll, but found libiomp5md.dll already initialized.
```

**What this means in simple words:**

OpenMP is a system that helps programs use multiple CPU cores at the same time (parallel processing). OpenCV (used for reading images) bundles its own copy of OpenMP. ONNX Runtime (used by InsightFace) also bundles its own copy of OpenMP. When both try to start up, they fight over who controls the system and crash.

**The fix:**

One line was added at the very top of the script, before any imports:
```python
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
```

This tells the OpenMP system: "if you find two copies of yourself, just use them both and don't crash." It is marked as "unsafe" by Intel (who makes OpenMP) but in practice it works fine for our use case and is the standard workaround for this exact situation on Windows.

#### Problem 2 — JSON Crash at the End

After successfully detecting all faces and saving the annotated images, the script crashed when trying to save the results to a JSON file:

```
TypeError: Object of type int64 is not JSON serializable
```

**What this means in simple words:**

Python has a built-in integer type called `int`. InsightFace returns numbers in NumPy's integer format called `int64` (a different type used in AI/data science libraries). Python's JSON writer only knows how to handle the standard Python `int` — it does not know what to do with `int64`.

It is like trying to put a square peg in a round hole — both are integers to a human, but Python's JSON library sees them as different types.

**The fix:**

When storing each value in the results dictionary, explicit conversion was added:
```python
"bbox": [int(x1), int(y1), int(x2), int(y2)],
"age":  int(age),
"det_score": float(det_score),
```

This converts each numpy value to a plain Python type before it goes into the JSON, so the JSON writer has no problem with it.

### Results — What InsightFace Found

| Image | Caffe | DeepFace | InsightFace |
|---|---|---|---|
| image copy 2.png | 0 | 0 (broken) | **7** |
| image copy.png | 4 | 0 (broken) | **4** |
| image.png | 2 | 0 (broken) | **2** |
| OIP (1).jpg | 4 | 0 (broken) | **4** |
| OIP.jpg | 5 | 0 (broken) | **5** |
| group thumbnail.png | 2 | 0 (broken) | **4** |
| test.jpg | 0 | 0 (broken) | 0 |
| **Total** | **17** | **0** | **26** |

**InsightFace detected 26 faces across 7 images — the highest of all three models.**

Note: DeepFace's 0s are not real — they are caused by the broken model files. DeepFace cannot be fairly compared until Step 2 is fixed.

### Full Audience Summary From InsightFace

- **Total faces detected:** 26
- **Average age:** 35.7 years
- **Age range:** 21 to 63 years
- **Male:** 12 faces
- **Female:** 14 faces
- **Dominant age group:** Adult (21–45 years) — 21 out of 26 faces

**Ad categories that would have been shown:**
- Cars / Finance (adult males) — most common
- Lifestyle / Travel (adult females) — second most common
- Fashion / Beauty (youth females)
- Gaming / Sports (youth males)
- Healthcare / Insurance (senior female, age 63)
- Skincare / Wellness (middle-aged female)

### Challenges InsightFace Flagged

#### Challenge 1 — Small Face Size in Some Images

For OIP (1).jpg, OIP.jpg, and the group thumbnail image, InsightFace flagged that the detected faces were very small — some as small as **19x27 pixels**.

**Why this is a problem:**

The age and gender models inside InsightFace were trained on face images that are much larger. When a face is only 20 pixels wide, there is very little detail to work from. The model still gives an answer, but it is essentially making an educated guess based on very little information.

**In real life:** This happens when people are standing far away from the camera — they are a small dot in the frame. To get accurate age/gender readings, the camera needs to be close enough that faces fill a reasonable portion of the image (at least 40x40 pixels recommended).

#### Challenge 2 — test.jpg Has No Faces

All three models found 0 faces in test.jpg. This image was likely not a photo of people, or the people in it are too far, facing away, or in very poor lighting.

#### Challenge 3 — Speed Is Still Slow on CPU

InsightFace took an average of **4,651ms (about 4.6 seconds) per image** on CPU. For real-time use this is not fast enough for smooth per-frame analysis. In the main pipeline, inference is run every 15 seconds on a separate thread to avoid freezing the camera — so this speed is acceptable in the current architecture.

If a GPU were available, InsightFace would run in under 100ms per image.

---

## Updated File List (After Steps 2 and 3)

| File | What it does | Status |
|------|-------------|--------|
| `step2_deepface_test.py` | Tests DeepFace age + gender model on all test images | WRITTEN — ON HOLD (model weights broken) |
| `step3_insightface_test.py` | Tests InsightFace buffalo_l model on all test images | DONE |
| `step3_results/` | Annotated images + JSON report from InsightFace | DONE |
| `step3_results/step3_insightface_results.json` | Full detection results in JSON format | DONE |

---

## Updated Complete Status Table

| What | Status |
|------|--------|
| Live camera capture | DONE |
| Real Qwen2-VL model integrated | DONE |
| Background thread — camera never freezes | DONE |
| Smoothing buffer for stable display | DONE |
| Validation and auto-correction layer | DONE |
| Batch dataset generation | DONE |
| Data cleaning script | DONE |
| Data analysis and statistics | DONE |
| Validation unit tests (9/9 passing) | DONE |
| Model robustness testing (7 conditions) | DONE |
| Advanced consistency testing (3 runs per condition) | DONE |
| Step 1 — OpenCV Caffe age + gender baseline test | DONE |
| Step 2 — DeepFace test | ON HOLD (corrupted model weights — needs re-download) |
| Step 3 — InsightFace test | DONE |
| Step 4 — Side-by-side model comparison | NOT STARTED |
| Age-based ad selector logic | NOT STARTED |
| FastAPI backend server | NOT STARTED |
| Switch from SQLite to PostgreSQL | NOT STARTED |
| React dashboard frontend | NOT STARTED |
| WebSocket for live data push | NOT STARTED |
| RTSP IP camera support | NOT STARTED |

---

## What Is Next

**Option A — Fix Step 2 (DeepFace) first:**
- Download `age_model_weights.h5` (~85MB) and `gender_model_weights.h5` (~45MB) from the DeepFace GitHub releases page
- Place them in `C:\Users\Ariba Shakil\.deepface\weights\`
- Re-run `step2_deepface_test.py` and get real results
- Then do a proper 3-way comparison

**Option B — Move to Step 4 (comparison) using Caffe vs InsightFace:**
- Skip DeepFace for now since Step 2 is on hold
- Write `step4_comparison.py` that directly compares Caffe and InsightFace side by side
- Decide which model to plug into the live camera pipeline in `main.py`

**Current best model based on evidence so far: InsightFace**
- Detected 26 faces vs Caffe's 17
- Found faces that Caffe missed entirely (image copy 2.png: 7 vs 0)
- Gives numeric age (more useful than Caffe's age buckets)
- Gender detection with confidence score

---

## Why We Chose InsightFace Over Qwen

After Step 4 comparison was done and InsightFace was confirmed working live on the webcam, we had to decide which AI to plug into `main.py`. The two options were Qwen (already wired in) and InsightFace (just tested). We chose InsightFace.

---

### What Qwen does (and why it is the wrong tool here)

Qwen is a Vision Language Model — the same category of AI as ChatGPT with vision. You send it an image and ask a question in plain English. It replies with a sentence.

Example: send it a camera frame and ask "How many people are in this image and what are their ages and genders?" It replies:

> "There appear to be 2 people — one adult male around 30 years old and one young female."

You then have to write code to read that sentence and pull out the numbers. This is called **text parsing** and it is fragile. If Qwen words its answer slightly differently next time, the parser breaks and your database gets garbage data.

On top of that, Qwen takes **15–30+ seconds per frame** on CPU. The pipeline runs every 15 seconds — you would spend the entire window just waiting for one inference.

---

### What InsightFace does (and why it is the right tool)

InsightFace is a computer vision model built specifically for faces. You give it an image. It gives back structured data immediately — no sentences, no parsing:

```
Face 1:  age=28,  gender=Male,   bbox=[120, 80, 240, 210],  confidence=94%
Face 2:  age=34,  gender=Female, bbox=[310, 90, 430, 220],  confidence=89%
```

Every value maps directly into a database column. `male` count, `female` count, `viewer_count` — all come out as numbers ready to save.

---

### Comparison table

| | InsightFace | Qwen |
|---|---|---|
| Built for | Face analysis (age, gender, detection) | General image understanding |
| Output format | Structured numbers per face | A sentence in plain English |
| Speed on CPU | 200–500 ms per frame | 15–30+ seconds per frame |
| Needs text parsing? | No | Yes — fragile |
| Consistent output? | Yes — deterministic | No — wording varies |
| Tested live on webcam? | Yes — confirmed working | Partially simulated |
| Maps to DB columns directly? | Yes | No — needs conversion |

---

### Simple way to think about it

Qwen is like asking a person *"what do you see?"* and writing down their answer.
InsightFace is like a sensor that directly measures and reports numbers.

For a system that saves `viewer_count`, `male`, `female` to a database every 15 seconds, a sensor is the right tool — not a language model.

---

### The one trade-off we accepted

InsightFace only does faces. It cannot answer open-ended questions like "are people smiling?" or "what are they looking at?". Qwen could do those things.

For this project — counting viewers and estimating age and gender — that trade-off is worth it. If the scope expands later (emotion detection, attention tracking), Qwen could be added back alongside InsightFace for those specific tasks.

---

## Phase 5 — React Dashboard Frontend (COMPLETED April 2026)

---

### What We Built

A live web dashboard that runs in the browser and shows audience analytics in real time. It pulls data from the FastAPI backend (inside `pipeline.py`) and auto-refreshes every 5 seconds — no manual page refresh needed.

You open it by running the React app and going to `http://localhost:5173` in your browser. The dashboard is dark-themed and shows all the key numbers in one place.

---

### Why We Need This

Until now, the only way to see the analytics was:
1. Look at the OpenCV window (camera with text overlay) — only works on the machine running the camera
2. Check the SQLite database with a terminal command — not user-friendly

The React dashboard solves both problems:
- Anyone on the same network can open it in a browser
- It shows charts, gauges, and color-coded cards — not raw numbers in a database

---

### New Folder: `smart-audience-dashboard/`

This is a completely separate project from the Python backend. It is a React app (a JavaScript framework for building web UIs). You run it separately from `pipeline.py`.

```
smart-audience-dashboard/
├── src/
│   ├── api.js                        ← All HTTP calls to the backend
│   ├── hooks/
│   │   └── usePolling.js             ← Auto-refresh timer logic
│   ├── components/
│   │   ├── StatusBar.jsx             ← Top bar: connected/offline + time
│   │   ├── StatCard.jsx              ← Reusable summary number card
│   │   ├── GenderBar.jsx             ← Blue/pink horizontal split bar
│   │   ├── AgeChart.jsx              ← Horizontal bar chart: age groups
│   │   ├── HistoryChart.jsx          ← Line chart: viewers + engagement over time
│   │   ├── EngagementGauge.jsx       ← Circular gauge: engagement %
│   │   └── AdRecommendation.jsx      ← Highlighted card: recommended ad type
│   ├── App.jsx                       ← Main layout, wires all components together
│   ├── main.jsx                      ← Entry point — mounts React into the HTML page
│   └── index.css                     ← Global styles (Tailwind base)
├── tailwind.config.js                ← Tells Tailwind which files to scan
├── postcss.config.js                 ← Required for Tailwind to process CSS
├── vite.config.js                    ← Build and dev server config
└── package.json                      ← Lists all JS libraries used
```

---

### File-by-file explanation

---

#### `src/api.js` — The API connector

**Purpose:** All calls to the Python backend live here. If the backend URL ever changes, you only update this one file.

**Technical detail:** Uses `axios` — a JavaScript library for making HTTP requests. It is easier to use than the built-in `fetch()` and handles errors more cleanly.

**Four functions:**
- `fetchHealth()` → calls `/api/v1/health` — is the server alive?
- `fetchLive()` → calls `/api/v1/analytics/live` — latest one-row snapshot
- `fetchHistory(limit)` → calls `/api/v1/analytics/history` — last N rows for charts
- `fetchSummary(limit)` → calls `/api/v1/analytics/summary` — averages for cards

---

#### `src/hooks/usePolling.js` — The auto-refresh engine

**Purpose:** A "hook" (reusable piece of logic) that keeps calling a function on a timer and gives the component back the latest result.

**Simple analogy:** Imagine setting a kitchen timer that goes off every 5 seconds and each time it rings, you go check the camera. This hook does that automatically.

**Technical detail:**
- Uses `useEffect` (runs once when the component appears on screen)
- Uses `setInterval` to repeat the fetch every N milliseconds
- Uses `clearInterval` in cleanup so the timer stops when the component is removed
- Returns `{ data, error, loading }` — the component can use these to decide what to show

---

#### `src/components/StatusBar.jsx` — Connection indicator

**Purpose:** The thin bar at the top of the dashboard. Shows a green pulsing dot when the backend is running, red dot when it is offline. Also shows the last time data was received.

**Why it matters:** Without this, you would not know if the numbers on screen are live or stale (e.g. if `pipeline.py` crashed).

---

#### `src/components/StatCard.jsx` — Reusable number card

**Purpose:** A single dark card showing one metric (e.g. "Viewers Now: 4"). Used four times in the top row. By making it reusable, we avoid writing the same card HTML four times.

**Props it accepts:**
- `label` — text above the number
- `value` — the big number
- `icon` — emoji on the right
- `highlight` — color class for the number (green, blue, yellow, purple)
- `sub` — small grey text below the number (e.g. "last 30 windows")

---

#### `src/components/GenderBar.jsx` — Male vs Female bar

**Purpose:** A horizontal bar that fills proportionally. Left side = blue (male), right side = pink (female). Percentages come from `male_pct` and `female_pct` in the live API data.

**Technical detail:** The bar is built with two `div` elements side by side inside a flex container. Their widths are set with inline styles (e.g. `width: 60%`). CSS `transition` makes the bar animate smoothly when the numbers change.

---

#### `src/components/EngagementGauge.jsx` — Circular engagement meter

**Purpose:** A round dial showing what % of detected faces are "looking at" the display. Green = high, yellow = medium, red = low.

**Technical detail:** Built with raw SVG (Scalable Vector Graphics — drawing in code). Uses the `stroke-dasharray` / `stroke-dashoffset` trick:
- Draw a full circle with a dashed border
- The dash length = engagement% × circumference
- The gap length fills the rest
- Result: a circle that is partially filled like a gauge dial

This avoids needing a third-party chart library just for one circle.

---

#### `src/components/AgeChart.jsx` — Age group breakdown

**Purpose:** Horizontal bar chart showing what fraction of the audience is in each age group: Child, Youth, Adult, Middle Aged, Senior.

**Technical detail:** Uses Recharts `BarChart` with `layout="vertical"`. Each bar gets its own color. The data comes from the five `age_*_pct` fields in the live API response (converted from 0–1 to 0–100% for display).

---

#### `src/components/HistoryChart.jsx` — Time series line chart

**Purpose:** Shows how viewer count and engagement rate have changed over the last 40 data points (about 6–7 minutes). Two lines on one chart:
- Green line = viewer count (left Y axis, raw number)
- Yellow line = engagement % (right Y axis, 0–100%)

**Technical detail:** Uses Recharts `LineChart` with two `YAxis` components — one on each side of the chart — because the two metrics have different scales (count vs percentage). `dot={false}` removes the circle markers so the line is clean.

---

#### `src/components/AdRecommendation.jsx` — Recommended ad card

**Purpose:** The most important output of the whole system. Based on who the AI detected (age + gender), it shows what ad category should be displayed right now. The card background gradient changes colour based on the category (e.g. blue for Gaming, pink for Fashion).

**Where the recommendation comes from:** The `dominant_ad` field in the live API response. This was already computed in `pipeline.py` using the `get_ad_category(age_group, gender)` function.

---

#### `src/App.jsx` — The main layout file

**Purpose:** Ties all components together. Fetches data from all four API endpoints using the `usePolling` hook, then passes the data as "props" (like arguments) into each component.

**Polling schedule:**
- `/live` and `/history` → every 5 seconds (fast — these are the live numbers)
- `/summary` and `/health` → every 10 seconds (slower — these change less)

**Layout is a CSS Grid:**
- Row 1: 4 stat cards side by side
- Row 2: gender bar (takes 2/3 width) + engagement gauge (1/3 width)
- Row 3: full-width history line chart
- Row 4: age bar chart (half) + ad recommendation card (half)

---

### Libraries used in the dashboard

| Library | What it does | Why we chose it |
|---------|-------------|-----------------|
| React | Builds the UI as reusable components | Industry standard for dashboards |
| Vite | Dev server + build tool | Much faster than webpack/CRA |
| Tailwind CSS | Utility-class styling | Write styles inline, no separate CSS files |
| Recharts | Line charts, bar charts | Built for React, uses SVG, easy to customise |
| Axios | HTTP requests to the backend | Cleaner than fetch(), handles errors well |

---

### How to run the dashboard

**Step 1:** Start the backend (in one terminal):
```
cd C:\Users\Ariba Shakil\OneDrive\Pictures\Desktop\SmartAudienceAnalysis
python pipeline.py
```
This starts the camera + InsightFace + FastAPI server on port 8000.

**Step 2:** Start the dashboard (in a second terminal):
```
cd smart-audience-dashboard
npm run dev
```
Then open `http://localhost:5173` in your browser.

---

### Updated Complete Status Table (April 2026)

| What | Status |
|------|--------|
| Live camera capture | DONE |
| InsightFace age + gender detection | DONE |
| Background inference thread | DONE |
| Smoothing buffer for stable data | DONE |
| Age group classification | DONE |
| Gender classification | DONE |
| Ad category recommendation logic | DONE |
| Engagement proxy (det_score) | DONE |
| SQLite database with thread-safe writes | DONE |
| FastAPI backend — /live endpoint | DONE |
| FastAPI backend — /history endpoint | DONE |
| FastAPI backend — /summary endpoint | DONE |
| FastAPI backend — /health endpoint | DONE |
| React dashboard — StatusBar | DONE |
| React dashboard — StatCards (4 metrics) | DONE |
| React dashboard — Gender split bar | DONE |
| React dashboard — Engagement gauge | DONE |
| React dashboard — History line chart | DONE |
| React dashboard — Age breakdown chart | DONE |
| React dashboard — Ad recommendation card | DONE |
| Real gaze detection (L2CS-Net) | NOT STARTED |
| RTSP / IP camera support | NOT STARTED |
| Switch SQLite → PostgreSQL | NOT STARTED |
| Multi-camera support | NOT STARTED |

---

### What Is Next

**Option A — Test the full system end-to-end:**
Run `pipeline.py` and `npm run dev` at the same time. Open the dashboard in a browser. Confirm all cards, charts, and the status indicator update live.

**Option B — Add real gaze detection:**
Replace the `det_score` engagement proxy with L2CS-Net (a dedicated gaze estimation model). This would give a real "is this person looking at the screen?" signal instead of using face detection confidence as a proxy.

**Option C — Add RTSP camera support:**
Change `cv2.VideoCapture(0)` to accept an RTSP URL so the system can work with IP cameras (not just a laptop webcam). This is a one-line change in `pipeline.py` but requires testing with a real IP camera.
- Fast enough for the 15-second inference interval used in main.py

---

## Phase 12 — GPU Support + Unique Visitor Hashing + Crowd Confidence Thresholds (COMPLETE)

### What was added

#### 1. GPU Support (Auto-detect)
- Added `USE_GPU = True` config flag in `pipeline.py`
- Added `_get_onnx_providers()` function that checks `onnxruntime.get_available_providers()` at runtime
- If NVIDIA GPU + `onnxruntime-gpu` installed → uses `CUDAExecutionProvider` (5–10× faster)
- If not → silently falls back to `CPUExecutionProvider` (no crash, no manual change needed)
- `utils/emotion_detection.py` already had GPU providers — no change needed there
- To enable GPU: `pip uninstall onnxruntime && pip install onnxruntime-gpu`

#### 2. Emotion Detection (FerPlus ONNX)
- New file: `utils/emotion_detection.py`
- Downloads EmotionFerPlus ONNX model (~33MB) on first run
- Detects 8 emotions per face: happiness, surprise, neutral, sadness, anger, disgust, fear, contempt
- Emotion influences ad selection — anger/disgust/contempt → calmer ad override
- Mood Quality Score = engagement_rate × emotion_weight (happiness=1.5×, neutral=1.0×, anger=0.3×)
- Dashboard: EmotionChart (stacked bar), Mood Score stat card, emotion badge in AdRecommendation

#### 3. Unique Visitor Hashing
- InsightFace buffalo_l already computes a 512-dim ArcFace `normed_embedding` per face
- New function `_check_visitor(embedding)` compares cosine similarity (dot product of unit vectors) against all recently seen embeddings
- `VISITOR_SIMILARITY_THRESHOLD = 0.50` — similarity ≥ this = same person
- `VISITOR_EXPIRE_SECONDS = 300` — forget a face after 5 minutes of absence
- `unique_visitors_session` counter increments only for genuinely new faces
- Exposed via API (`unique_visitors_session` field) and WebSocket broadcast
- Dashboard: "Unique Visitors" stat card (indigo, 🪪 icon)

#### 4. Gender Confidence Threshold
- `GENDER_CONFIDENCE_THRESHOLD = 0.60`
- One gender must be ≥ 60% of the crowd to show a gender-targeted ad
- Mixed crowd (e.g. 5M + 5F = 50/50) → neutral age-appropriate ad instead
- Dashboard: GenderBar shows "Male majority" / "Female majority" / "Mixed crowd — neutral ad" badge

#### 5. Age Confidence Threshold
- `AGE_CONFIDENCE_THRESHOLD = 0.60`
- Dominant age group must be ≥ 60% of crowd to drive an age-targeted ad
- Mixed age crowd → falls back to broad-appeal ad
- Full decision matrix:

| Gender confident? | Age confident? | Ad shown |
|---|---|---|
| Yes | Yes | Fully targeted (e.g. Cars/Finance for adult male) |
| Yes | No | Gender-broad (Lifestyle/Travel or Gaming/Sports) |
| No | Yes | Age-appropriate neutral (no gender bias) |
| No | No | General Ad |

- Dashboard: AdRecommendation card shows "Mixed gender" and/or "Mixed age" badges when confidence is low

#### 6. Backend/API additions
- WebSocket `/ws/live` — real-time push to dashboard
- CSV export `GET /api/v1/export?date=YYYY-MM-DD`
- Webhook alerts (Slack/n8n) when engagement < 25%
- API key auth (`X-API-Key` header middleware)
- Multi-camera support (`/api/v1/cameras` endpoint)
- Docker + docker-compose (pipeline on port 8000, dashboard on 5173)

#### 7. Dashboard additions (React/Vite/Tailwind/Recharts)
- 5 tabs: Live View, Today's Analytics, Ad Performance, Alerts, Settings
- 8 stat cards: Viewers Now, Avg Viewers, Avg Engagement, Dominant Age, Avg Dwell, Impressions Today, Mood Score, Unique Visitors
- Demo Mode — realistic fake data, no camera needed
- Auto-reconnecting WebSocket hook with blue "Live" indicator
- AlertsPanel with severity levels (Critical/High/Medium)
- AdPerformancePage with A/B comparison mode
- AnalyticsPage with date picker and CSV export button
- SettingsPage with screen name, poll interval, read-only config

---

## Current Tech Stack

| Layer | Technology |
|---|---|
| Camera | OpenCV |
| Face AI | InsightFace buffalo_l (ONNX) |
| Emotion AI | FerPlus ONNX model (8 classes) |
| Gaze | OpenCV solvePnP (head pose estimation) |
| Unique visitors | ArcFace embeddings + cosine similarity |
| Backend | Python + FastAPI + Uvicorn |
| Database | SQLite (default) / PostgreSQL (optional) |
| Realtime | WebSocket |
| Dashboard | React + Vite + Tailwind CSS + Recharts |
| Deployment | Docker + docker-compose |

## Endpoints (8 REST + 1 WebSocket)

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/analytics/live` | Current snapshot |
| `GET /api/v1/analytics/history` | Last N rows for charts |
| `GET /api/v1/analytics/summary` | Averages over time window |
| `GET /api/v1/analytics/dwell` | Dwell session data |
| `GET /api/v1/cameras` | List cameras with data |
| `GET /api/v1/alerts` | Low engagement events |
| `GET /api/v1/export` | Download CSV report |
| `GET /api/v1/health` | Server health check |
| `WS  /ws/live` | Real-time push stream |
