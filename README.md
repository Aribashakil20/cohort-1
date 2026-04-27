# SmartAudienceAnalysis

A real-time AI-powered audience analytics system for digital displays. Point a webcam at people standing in front of a screen — the system automatically detects their age, gender, and emotion, measures how engaged they are, and recommends the most relevant ad to show. Everything is visualized live on a web dashboard.

No video is stored. No one is identified by name. The system only tracks anonymous traits to improve ad relevance.

---

## What it does

When someone stands in front of a display:

1. The camera captures the scene
2. InsightFace AI detects every face and estimates age, gender, and a 512-dimensional face fingerprint
3. The emotion model (FerPlus) reads the facial expression — happy, neutral, angry, surprised, etc.
4. Head pose estimation checks if the person is actually facing the screen (real engagement)
5. The unique visitor tracker uses the face fingerprint to count each person only once — even if they stand there for 5 minutes
6. The system looks at the whole crowd and picks the best ad category to show
7. All data is saved to a database and pushed live to the dashboard

---

## Key intelligence

### Ad targeting with confidence thresholds
The system does not blindly pick the majority gender or age. It only shows a targeted ad if one group is **clearly dominant** in the crowd:

- **Gender threshold: 60%** — if 6 out of 10 people are male, show a male-targeted ad. If it's 5/5, show a neutral ad instead
- **Age threshold: 60%** — same logic for age groups

| Gender confident? | Age confident? | Ad shown |
|---|---|---|
| Yes (>=60%) | Yes (>=60%) | Fully targeted — e.g. "Cars / Finance" for adult male |
| Yes | No | Gender-broad — e.g. "Gaming / Sports" for any male |
| No | Yes | Age-neutral — e.g. "Health / Home Appliances" for adults |
| No | No | General Ad |

### Emotion-adjusted ads
If the dominant emotion in the crowd is anger, disgust, or contempt — the system overrides to a calmer, wellness-focused ad. Showing an aggressive sales ad to a frustrated audience worsens brand perception.

### Engagement quality score
Not all engagement is equal. A happy, engaged audience scores higher than a neutral one:
- Happiness weight: 1.5×
- Neutral weight: 1.0×
- Anger weight: 0.3×

Score = engagement rate × average emotion weight (capped at 100)

### Unique visitor counting
Uses ArcFace face embeddings (512-dimensional vectors). Two photos of the same person produce vectors with cosine similarity > 0.85. Different people score < 0.3. Threshold is 0.50. Faces not seen for 5 minutes are forgotten and counted fresh on return.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    pipeline.py                       │
│                                                     │
│  Main thread        Background thread   API thread  │
│  ┌──────────┐       ┌──────────────┐   ┌─────────┐ │
│  │  OpenCV  │──────▶│ InsightFace  │   │ FastAPI │ │
│  │  Camera  │ frame │ buffalo_l    │   │ Uvicorn │ │
│  │  Loop    │       │ + FerPlus    │   │ :8000   │ │
│  └──────────┘       │ + solvePnP   │   └────┬────┘ │
│       │             └──────┬───────┘        │      │
│       │                    │ results         │      │
│       ▼                    ▼                │      │
│  ┌──────────┐       ┌──────────────┐        │      │
│  │  SQLite  │◀──────│ compute_     │        │      │
│  │  / PG   │        │ summary()    │        │      │
│  └──────────┘       └──────────────┘        │      │
│       │                                     │      │
│       └─────────────────────────────────────┘      │
│                    WebSocket push                   │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│              React Dashboard :5173                  │
│  Live View │ Analytics │ Ad Performance │ Alerts    │
└─────────────────────────────────────────────────────┘
```

**Threading model:**
- Main thread runs the camera loop (OpenCV requires GUI on main thread)
- Background thread runs AI inference every 15 frames (heavy, ~300ms on CPU)
- API thread runs FastAPI/Uvicorn serving HTTP + WebSocket
- A `threading.Lock` protects shared state between all three
- WebSocket bridge uses `asyncio.run_coroutine_threadsafe` to push from sync → async

---

## Tech stack

### Backend
| Component | Technology | Purpose |
|---|---|---|
| Camera capture | OpenCV 4.13 | Read frames from webcam or RTSP stream |
| Face detection | InsightFace buffalo_l | Detect faces, estimate age/gender, compute 3D landmarks |
| Face recognition | ArcFace (w600k_r50) | 512-dim face embedding for unique visitor tracking |
| Emotion detection | FerPlus ONNX | 8-class emotion classification per face |
| Gaze detection | OpenCV solvePnP | Head pose estimation from 3D landmarks (yaw + pitch) |
| API framework | FastAPI + Uvicorn | REST API + WebSocket server |
| Database | SQLite / PostgreSQL | Store analytics rows every 10 seconds |
| Runtime | ONNX Runtime | Execute all AI models (CPU or GPU) |

### Frontend
| Component | Technology | Purpose |
|---|---|---|
| Framework | React 18 + Vite | Component-based UI with fast dev server |
| Styling | Tailwind CSS | Utility-first dark theme |
| Charts | Recharts | Line, bar, stacked charts |
| Realtime | WebSocket hook | Auto-reconnect, zero-lag live updates |

### AI models used
| Model | Size | What it does |
|---|---|---|
| InsightFace buffalo_l | ~300MB (downloaded on first run) | Face detection, age, gender, 68 3D landmarks, ArcFace embedding |
| FerPlus ONNX | ~33MB (downloaded on first run) | 8-emotion classification (happiness, surprise, neutral, sadness, anger, disgust, fear, contempt) |

---

## Requirements

- **Python 3.10 or 3.11** — [python.org](https://www.python.org/downloads/)
- **Node.js 18+** — [nodejs.org](https://nodejs.org/)
- **Git** — [git-scm.com](https://git-scm.com/download/win)
- **A webcam**

> When installing Python on Windows — tick **"Add Python to PATH"** before clicking Install

---

## Setup (run once)

### Windows
```bat
git clone https://github.com/Aribashakil20/cohort-1.git
cd cohort-1
setup.bat
```

### Mac / Linux
```bash
git clone https://github.com/Aribashakil20/cohort-1.git
cd cohort-1
bash setup.sh
```

What setup does:
1. Creates a Python virtual environment (`venv/`)
2. Installs all Python packages from `requirements.txt`
3. Installs all Node.js packages for the dashboard

---

## Run

### Windows
```bat
start.bat
```

### Mac / Linux
```bash
bash start.sh
```

This opens two terminal windows:
- **Pipeline terminal** — camera loop + AI inference + API server (port 8000)
- **Dashboard terminal** — React dev server (port 5173)

Open **http://localhost:5173** in your browser and allow camera access.

> First run takes longer — InsightFace downloads ~300MB of AI models automatically.

---

## Dashboard tabs

### Live View
The main real-time screen. Updates every 10 seconds (or instantly via WebSocket).
- **8 stat cards:** Viewers Now, Avg Viewers, Avg Engagement, Dominant Age, Avg Dwell Time, Impressions Today, Mood Score, Unique Visitors
- **Gender Split bar** — shows Male/Female ratio with confidence badge (Male majority / Female majority / Mixed crowd)
- **Engagement Gauge** — dial showing current engagement rate vs previous window
- **Audience Mood chart** — stacked bar: Happy / Surprised / Neutral / Negative + Mood Quality Score
- **History chart** — viewer count + engagement rate over the last 40 windows
- **Age chart** — age group breakdown (child / youth / adult / middle-aged / senior)
- **Dwell chart** — session duration history
- **Ad Recommendation card** — shows recommended ad with confidence badges (Mood override / Mixed gender / Mixed age)

### Today's Analytics
- Date picker to browse any past day
- Hourly viewer and engagement charts
- Gender split and dominant age for the day
- CSV export button

### Ad Performance
- Impressions and engagement by ad category
- A/B comparison mode — compare two ad categories side by side

### Alerts
- Log of low-engagement events (below 25% threshold)
- Severity levels: Critical (<10%), High (<20%), Medium (<25%)

### Settings
- Screen name (saved in browser)
- Poll interval control
- Read-only config display (camera ID, API URL)

---

## Configuration

Edit the top of `pipeline.py` to customise behaviour:

```python
# Camera
CAMERA_INDEX                 = 0       # 0 = default webcam, 1 = second camera
CAMERA_ID                    = "cam_01"  # label saved with every DB row
CAMERA_SOURCE                = 0       # set to "rtsp://..." for IP cameras

# Inference timing
INFERENCE_EVERY              = 15      # run AI on every Nth frame (30fps → every 0.5s)
SAVE_EVERY_SECONDS           = 10      # write one DB row every N seconds

# Confidence thresholds
GENDER_CONFIDENCE_THRESHOLD  = 0.60   # one gender must be ≥60% of crowd for gendered ad
AGE_CONFIDENCE_THRESHOLD     = 0.60   # dominant age must be ≥60% of crowd for age ad

# Unique visitor tracking
VISITOR_SIMILARITY_THRESHOLD = 0.50   # cosine similarity ≥ this = same person
VISITOR_EXPIRE_SECONDS       = 300    # forget a face after 5 minutes

# GPU (optional)
USE_GPU                      = False  # set True if onnxruntime-gpu + CUDA toolkit installed

# Database
DB_BACKEND                   = "sqlite"   # or "postgres"
DB_PATH                      = "audience.db"

# Alerts
WEBHOOK_URL                  = ""     # Slack/n8n webhook URL (leave empty to disable)
WEBHOOK_ENGAGEMENT_THRESHOLD = 0.25   # alert when engagement drops below 25%

# Security
API_KEY                      = ""     # set a secret key to require X-API-Key header
```

---

## API reference

Base URL: `http://localhost:8000`

Interactive docs: `http://localhost:8000/docs`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/analytics/live` | Latest snapshot (most recent DB row) |
| GET | `/api/v1/analytics/history?limit=40` | Last N rows in chronological order |
| GET | `/api/v1/analytics/summary?window=30` | Averages across last N rows |
| GET | `/api/v1/analytics/dwell?limit=20` | Dwell session history |
| GET | `/api/v1/cameras` | List of all camera IDs with data |
| GET | `/api/v1/alerts?limit=50` | Low-engagement alert log |
| GET | `/api/v1/export?date=2026-04-27` | Download day's data as CSV |
| GET | `/api/v1/health` | Server + database health check |
| WS  | `/ws/live` | Real-time WebSocket stream (same shape as /live) |

---

## Demo Mode

No camera? No backend running? Click **Demo Mode** in the top bar.

The dashboard switches to realistic fake data — sine/cosine waves with noise — so you can explore every tab, chart, and feature without any setup.

---

## GPU acceleration (optional)

By default the system runs on CPU. To enable GPU (NVIDIA only):

```bash
pip uninstall onnxruntime
pip install onnxruntime-gpu
```

Then set `USE_GPU = True` in `pipeline.py`.

CUDA Toolkit must be installed (comes with most NVIDIA driver packages).
Speed improvement: ~5–10× faster inference (300ms → 30ms per frame).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Camera not opening | Close Zoom/Teams/any app using the camera. Try `CAMERA_INDEX = 1` |
| First run is slow | InsightFace downloads ~300MB of models — wait for "[+] InsightFace ready" |
| WebSocket not connecting | Make sure pipeline.py started before opening the browser |
| Port 8000 in use | Another app is using 8000 — change `API_PORT = 8001` in pipeline.py |
| Slow inference | Increase `INFERENCE_EVERY = 30` on slow machines |
| Gender always wrong | Already fixed — uses float confidence threshold not integer truncation |

---

## Project structure

```
cohort-1/
├── pipeline.py                  # Main backend — camera, AI, API, database
├── requirements.txt             # Python dependencies
├── setup.bat / setup.sh         # One-time setup script
├── start.bat / start.sh         # Launch script
├── audience.db                  # SQLite database (created on first run)
├── emotion_model.onnx           # FerPlus emotion model
├── utils/
│   ├── emotion_detection.py     # FerPlus ONNX wrapper
│   └── gaze_estimation.py       # solvePnP head pose estimation
└── smart-audience-dashboard/
    ├── src/
    │   ├── App.jsx              # Root component, data fetching, layout
    │   ├── api.js               # API + WebSocket base URLs
    │   ├── components/
    │   │   ├── StatCard.jsx         # Single metric card
    │   │   ├── GenderBar.jsx        # Male/Female split bar
    │   │   ├── EngagementGauge.jsx  # Dial gauge
    │   │   ├── EmotionChart.jsx     # Stacked emotion bar + mood score
    │   │   ├── HistoryChart.jsx     # Time series line chart
    │   │   ├── AgeChart.jsx         # Age group bar chart
    │   │   ├── DwellChart.jsx       # Dwell session chart
    │   │   ├── AdRecommendation.jsx # Ad card with confidence badges
    │   │   ├── AnalyticsPage.jsx    # Today's Analytics tab
    │   │   ├── AdPerformancePage.jsx# Ad Performance tab
    │   │   ├── AlertsPanel.jsx      # Alerts tab
    │   │   ├── SettingsPage.jsx     # Settings tab
    │   │   ├── StatusBar.jsx        # Top bar
    │   │   └── TabBar.jsx           # Tab navigation
    │   └── hooks/
    │       ├── usePolling.js        # Polling hook with interval control
    │       └── useWebSocket.js      # Auto-reconnect WebSocket hook
    └── package.json
```
