# Smart Audience Analysis System

A real-time system that uses a camera to observe the area in front of a digital display and automatically detects anonymous audience traits — without storing video or identifying anyone.

---

## What It Does

The system watches people standing in front of a screen and estimates:

| Trait | How |
|---|---|
| Number of people present | Face detection — InsightFace buffalo_l |
| Age group (child / youth / adult / middle-aged / senior) | Age estimation via ONNX model |
| Gender distribution (male / female) | Gender classification model |
| Engagement — is the person facing the screen? | Head pose estimation (yaw + pitch via solvePnP) |
| Dwell time — how long did visitors stay? | Population-level session tracking |
| Dominant ad category to show | Rule-based mapping from age + gender |

Every 10 seconds, a summary row is written to the database. A REST API serves this data to a live React dashboard.

**No video is stored. No individual is tracked. Only anonymous aggregate numbers.**

---

## Project Structure

```
SmartAudienceAnalysis/
│
├── pipeline.py                   ← Run this. Camera + AI + API server in one script
├── requirements.txt              ← Python dependencies (for pip or Docker)
├── Dockerfile                    ← Container image for the pipeline
├── docker-compose.yml            ← One-command full-stack startup
├── progress.md                   ← Full step-by-step project log with explanations
│
├── smart-audience-dashboard/     ← React dashboard (Vite + Tailwind + Recharts)
│   └── src/
│       ├── components/
│       │   ├── TabBar.jsx            ← 5-tab navigation bar
│       │   ├── StatusBar.jsx         ← Header: camera switcher, WS indicator, demo mode
│       │   ├── StatCard.jsx          ← Summary metric cards
│       │   ├── GenderBar.jsx         ← Male/female split bar
│       │   ├── AgeChart.jsx          ← Age group breakdown chart
│       │   ├── HistoryChart.jsx      ← Viewers + engagement over time
│       │   ├── EngagementGauge.jsx   ← Circular engagement gauge with trend arrow
│       │   ├── DwellChart.jsx        ← Dwell session duration bar chart
│       │   ├── AdRecommendation.jsx  ← Current ad recommendation card
│       │   ├── AnalyticsPage.jsx     ← "Today's Analytics" tab (date picker + CSV export)
│       │   ├── AdPerformancePage.jsx ← "Ad Performance" tab (A/B comparison mode)
│       │   ├── AlertsPanel.jsx       ← "Alerts" tab (engagement anomaly log)
│       │   └── SettingsPage.jsx      ← "Settings" tab (screen name, poll rate)
│       ├── hooks/
│       │   ├── usePolling.js         ← Auto-refresh hook (fallback for WebSocket)
│       │   └── useWebSocket.js       ← Real-time WebSocket hook with auto-reconnect
│       └── api.js                    ← Axios calls to FastAPI backend
│
├── utils/
│   ├── gaze_estimation.py        ← Head pose estimation (solvePnP + Euler angles)
│   └── live_insightface.py       ← Standalone webcam demo (no API)
│
├── model_testing/                ← AI model comparison (Steps 1–4)
└── caffe_models/                 ← Caffe model weights (baseline testing)
```

---

## Tech Stack

| Layer | Tool | Purpose |
|---|---|---|
| Camera input | OpenCV | Webcam or RTSP network stream |
| Face detection | InsightFace buffalo_l (ONNX) | Faces, age, gender, 3D landmarks |
| Gaze detection | OpenCV solvePnP | Head pose → yaw/pitch → looking or away |
| Inference runtime | ONNX Runtime (CPU) | No GPU required |
| Database | SQLite (default) / PostgreSQL | Analytics rows + dwell sessions |
| API server | FastAPI + Uvicorn | REST API, auto docs at /docs |
| Dashboard | React + Vite + Tailwind + Recharts | Live charts, demo mode |
| Threading | Python threading | Camera, AI, and API run simultaneously |

---

## How to Run

### 1 — Install Python dependencies

```bash
pip install insightface onnxruntime opencv-python fastapi uvicorn numpy
```

### 2 — Start the pipeline

```bash
python pipeline.py
```

This will:
- Load InsightFace model (~10 seconds on first run)
- Open your webcam (or RTSP stream — see config below)
- Start the API server at `http://localhost:8000`
- Show a live camera window with face detection overlay

### 3 — Start the dashboard

Open a second terminal:

```bash
cd smart-audience-dashboard
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

> **No camera? Use Demo Mode.**
> Click the **Demo Mode** button in the top-right of the dashboard.
> All charts fill with realistic fake data — no pipeline needed.

---

## Configuration

All settings are at the top of `pipeline.py`. The most important ones:

```python
# Camera source
CAMERA_SOURCE = 0                              # built-in webcam
CAMERA_SOURCE = "rtsp://192.168.1.100:554/stream"  # IP camera

# Camera identity (used to tag DB rows)
CAMERA_ID = "cam_01"     # change to "cam_02" for a second instance

# Database backend
DB_BACKEND = "sqlite"    # default — no setup needed
DB_BACKEND = "postgres"  # production — see PostgreSQL section below

# Gaze detection thresholds
YAW_THRESH   = 30.0      # max head turn (degrees left/right)
PITCH_THRESH = 25.0      # max head tilt (degrees up/down)
```

---

## API Endpoints

Base URL: `http://localhost:8000`

Interactive docs: `http://localhost:8000/docs`

| Endpoint | What it returns |
|---|---|
| `GET /api/v1/health` | Server + database status |
| `GET /api/v1/analytics/live` | Most recent 10-second snapshot |
| `GET /api/v1/analytics/history?limit=30` | Last N rows in time order (supports `?date=YYYY-MM-DD`) |
| `GET /api/v1/analytics/summary?limit=30` | Averages across last N rows |
| `GET /api/v1/analytics/dwell?limit=20` | Recent audience dwell sessions |
| `GET /api/v1/alerts?limit=20` | Log of engagement anomaly events |
| `GET /api/v1/cameras` | List of all camera IDs with data |
| `GET /api/v1/export?date=YYYY-MM-DD` | Download analytics data as CSV |
| `WS  /ws/live` | WebSocket — real-time push on every DB save |

All HTTP endpoints accept an optional `?camera_id=cam_01` filter to scope results to one camera.

**API Key Auth:** Set `API_KEY = "yoursecret"` in `pipeline.py`. All HTTP requests must then include:
```
X-API-Key: yoursecret
```
Leave `API_KEY = ""` to allow unauthenticated access (default / development).

**Example — `/api/v1/analytics/live`:**
```json
{
  "id": 42,
  "camera_id": "cam_01",
  "timestamp": "2026-04-26T12:15:00Z",
  "viewer_count": 3,
  "male_count": 2,
  "female_count": 1,
  "male_pct": 0.667,
  "female_pct": 0.333,
  "age_youth_pct": 0.333,
  "age_adult_pct": 0.667,
  "dominant_age_group": "adult",
  "engagement_rate": 0.667,
  "dominant_ad": "Cars / Finance"
}
```

**Example — `/api/v1/analytics/dwell`:**
```json
[
  {
    "id": 1,
    "camera_id": "cam_01",
    "start_time": "2026-04-26T12:12:14Z",
    "end_time": "2026-04-26T12:12:44Z",
    "duration_seconds": 30.1,
    "peak_count": 3,
    "avg_count": 2.1
  }
]
```

---

## Dashboard Features

**5 tabs:**

| Tab | What it shows |
|---|---|
| **Live View** | Real-time stats: 6 metric cards, gender bar, engagement gauge, history chart, age chart, dwell chart, ad recommendation |
| **Today's Analytics** | Date picker, hourly viewer + engagement chart, gender split, session duration distribution, CSV export button |
| **Ad Performance** | Impressions per ad category, avg engagement per category, A/B comparison mode |
| **Alerts** | Log of low-engagement events with severity, timestamp, viewer count |
| **Settings** | Editable screen name, poll interval selector, read-only pipeline config reference |

**Header features:**
- Multi-camera switcher — dropdown appears automatically when multiple cameras have data
- WebSocket indicator — blue "Live" dot when real-time connection is active, grey "Poll" when falling back
- Demo Mode — fill all charts with realistic fake data anywhere, no pipeline needed

---

## Gaze Detection — How It Works

Unlike a simple confidence score, the system uses **head pose estimation** to determine whether a person is actually facing the screen.

1. InsightFace returns 68 3D facial landmark points for each detected face
2. We pick 6 key points (nose tip, chin, eye corners, mouth corners)
3. OpenCV's `solvePnP` computes the head's rotation in 3D space
4. We extract **yaw** (left/right turn) and **pitch** (up/down tilt) from the rotation matrix
5. If `|yaw| < 30°` and `|pitch| < 25°` → person is looking at the screen

The camera window shows `Y:+12 P:-5 [LOOKING]` per face so you can see it working.

---

## Dwell Time Tracking

The system tracks how long audiences stay in front of the display using **population-level session tracking** — no individual is followed.

- When `viewer_count` goes from 0 → >0: a **session starts**
- While people are present: peak and average count are recorded
- When `viewer_count` drops to 0: session ends, duration saved to `dwell_sessions` table
- Sessions under 5 seconds are discarded (walk-bys)

---

## Ad Category Mapping

| Age Group | Male | Female |
|---|---|---|
| Child (≤12) | Toys / Boys Games | Toys / Girls Games |
| Youth (13–24) | Gaming / Sports | Fashion / Beauty |
| Adult (25–45) | Cars / Finance | Lifestyle / Travel |
| Middle-aged (46–60) | Health / Home Appliances | Skincare / Wellness |
| Senior (61+) | Healthcare / Insurance | Healthcare / Insurance |

---

## Multi-Camera Setup

Run two instances simultaneously, each with a different `CAMERA_ID` and `API_PORT`:

**Terminal 1 — entrance camera:**
```python
# pipeline.py config
CAMERA_SOURCE = 0
CAMERA_ID     = "cam_01"
API_PORT      = 8000
DB_BACKEND    = "postgres"
```

**Terminal 2 — checkout camera:**
```python
# pipeline.py config
CAMERA_SOURCE = 1
CAMERA_ID     = "cam_02"
API_PORT      = 8001
DB_BACKEND    = "postgres"
```

Query a specific camera:
```
GET /api/v1/analytics/live?camera_id=cam_01
GET /api/v1/analytics/history?camera_id=cam_02&limit=20
```

---

## PostgreSQL Setup (for production / multi-camera)

```bash
pip install psycopg2-binary
psql -U postgres -c "CREATE DATABASE smartaudience;"
```

Then in `pipeline.py`:
```python
DB_BACKEND  = "postgres"
PG_HOST     = "localhost"
PG_PORT     = 5432
PG_DBNAME   = "smartaudience"
PG_USER     = "postgres"
PG_PASSWORD = "your_password"
```

Tables are created automatically on first run.

---

## Model Selection — Why InsightFace

We tested three models against 7 real images:

| Model | Faces found | Speed | Status |
|---|---|---|---|
| OpenCV Caffe | 17 | 28.9 ms/img | Mis-buckets adults as children |
| DeepFace | 0 | — | Failed on Windows (HDF5 error) |
| InsightFace buffalo_l | 26 | 4,651 ms/img | **Selected** — most accurate, numeric ages, 3D landmarks |

InsightFace found 53% more faces than Caffe and returns numeric ages (e.g. 34) plus 3D facial landmarks used for head pose estimation. Full comparison: `model_testing/step4_comparison.json`.

---

## Docker — One-Command Startup

### Run everything with Docker Compose

```bash
docker compose up
```

This starts:
- **pipeline** container — Python + InsightFace + FastAPI on port 8000
- **dashboard** container — React dev server on port 5173

Open `http://localhost:5173` in your browser.

### With PostgreSQL

```bash
docker compose --profile postgres up
```

### Configuration via `.env`

Create a `.env` file next to `docker-compose.yml`:

```env
CAMERA_SOURCE=rtsp://admin:password@192.168.1.100:554/stream
CAMERA_ID=entrance
API_KEY=mysecretkey123
WEBHOOK_URL=https://hooks.slack.com/services/...
```

---

## Webhook Alerts

When `WEBHOOK_URL` is set, the pipeline POSTs a JSON payload whenever engagement drops below `WEBHOOK_ENGAGEMENT_THRESHOLD` (default 25%):

```json
{
  "text": "⚠️ Low Engagement Alert — cam_01\nEngagement: 18% (threshold: 25%)\nViewers: 2 | Ad: Cars / Finance"
}
```

This payload format is compatible with **Slack Incoming Webhooks**, n8n, Zapier, and any HTTP POST endpoint.

Configure in `pipeline.py`:
```python
WEBHOOK_URL                  = "https://hooks.slack.com/services/..."
WEBHOOK_ENGAGEMENT_THRESHOLD = 0.25   # 25%
WEBHOOK_COOLDOWN_SECONDS     = 60     # max one alert per minute
```

---

## CSV Export

Download all analytics data for a specific day:

```
GET /api/v1/export?date=2026-04-26&camera_id=cam_01
```

Or click the **⬇ Export CSV** button in the Today's Analytics tab.

---

## WebSocket Real-Time Streaming

Connect to `ws://localhost:8000/ws/live` to receive a JSON push every time a new analytics row is saved (every ~10 seconds). The dashboard uses this automatically — the blue "Live" dot in the header confirms the connection.

The payload has the same shape as `GET /api/v1/analytics/live`:
```json
{
  "camera_id": "cam_01",
  "timestamp": "2026-04-26T14:32:10Z",
  "viewer_count": 3,
  "engagement_rate": 0.667,
  "dominant_ad": "Cars / Finance",
  ...
}
```

---

## What Has Been Built

- [x] Live camera capture — webcam and RTSP/IP camera support
- [x] InsightFace face detection, age estimation, gender classification
- [x] Background inference thread — camera stays smooth at 30fps
- [x] Result smoothing across 3 inference cycles
- [x] Age group classification — 5 buckets (child / youth / adult / middle-aged / senior)
- [x] Gender distribution — male %, female %
- [x] **Real gaze detection** — head pose via solvePnP, yaw + pitch angles per face
- [x] Ad category recommendation engine — 10 age × gender combinations
- [x] **Dwell time tracking** — population-level session start/end/duration
- [x] SQLite database — one row every 10 seconds
- [x] **PostgreSQL support** — production-grade, multi-writer safe
- [x] **Multi-camera support** — camera_id tags all rows, API filters by camera
- [x] Thread-safe DB reads/writes (threading.Lock)
- [x] FastAPI REST API — 8 endpoints with Pydantic validation
- [x] **RTSP / IP camera support** with auto-reconnect on network drop
- [x] **WebSocket real-time streaming** — push on every DB save, zero-lag updates
- [x] **CSV export** — download any day's analytics data via API or dashboard button
- [x] **Webhook alerts** — POST to Slack/n8n/Zapier when engagement drops below threshold
- [x] **API key authentication** — optional X-API-Key header protection
- [x] **Docker + docker-compose** — one-command full-stack startup
- [x] React dashboard — 5 tabs (Live, Analytics, Ad Performance, Alerts, Settings)
- [x] **Multi-camera switcher** — dropdown in header when multiple cameras are active
- [x] **Date range selector** — view any past day's analytics with hourly breakdown
- [x] **A/B comparison mode** — compare two ad categories head-to-head in Ad Performance tab
- [x] **Alerts tab** — real-time log of engagement anomalies with severity levels
- [x] **Dwell time chart** — session durations colored by peak viewer count
- [x] **Demo Mode** — realistic fake data for presenting without a camera
- [x] Windows asyncio fix for Uvicorn in background thread
- [x] DB schema migration — works on existing and new databases

---

## Privacy

- No video is saved at any point
- No individual face images are stored
- No person is tracked across frames
- Every database row contains only aggregate numbers (counts and percentages)
- Dwell sessions store only duration and counts — never who was there
- The system cannot identify who anyone is
