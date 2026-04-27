# SmartAudienceAnalysis

Real-time AI audience analytics for digital displays. Detects faces from a webcam, identifies age, gender and emotion, and recommends the best ad to show — all live on a web dashboard.

---

## What it does

- Detects every face in front of a screen in real time
- Identifies age group, gender, and emotion per face
- Recommends the most relevant ad category based on who is watching
- Only shows a gender/age-targeted ad if one group is clearly dominant (60% threshold)
- Tracks unique visitors using face embeddings (no double counting)
- Measures real engagement via head pose — is the person actually facing the screen?
- Saves all data to a database and shows it on a live dashboard

---

## Requirements

Before running, make sure you have:

- **Python 3.10 or 3.11** — [python.org](https://www.python.org/downloads/)
- **Node.js 18+** — [nodejs.org](https://nodejs.org/)
- **A webcam** connected to your computer

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

Then open **http://localhost:5173** in your browser.

Allow camera access when the browser asks — or use **Demo Mode** (button in the top bar) to see the dashboard with realistic fake data without a camera.

---

## Dashboard tabs

| Tab | What it shows |
|---|---|
| **Live View** | Real-time viewer count, gender split, engagement, emotion, ad recommendation |
| **Today's Analytics** | Hourly charts, date picker, CSV export |
| **Ad Performance** | Impressions and engagement by ad category, A/B comparison |
| **Alerts** | Low-engagement events with severity levels |
| **Settings** | Screen name, poll interval, camera info |

---

## How the ad is selected

The system looks at everyone in frame and picks the ad that best fits the crowd:

| Gender confident (>=60%)? | Age confident (>=60%)? | Ad shown |
|---|---|---|
| Yes | Yes | Fully targeted (e.g. Cars/Finance for adult male) |
| Yes | No | Gender-broad (e.g. Gaming/Sports for any male) |
| No | Yes | Age-neutral (e.g. Health/Appliances, any gender) |
| No | No | General Ad |

If the audience shows strong negative emotion (anger, disgust), a calmer wellness ad overrides the normal selection.

---

## Configuration

Edit the top section of `pipeline.py` to change:

```python
CAMERA_INDEX                 = 0      # change if you have multiple cameras
CAMERA_ID                    = "cam_01"
SAVE_EVERY_SECONDS           = 10     # how often to save to DB
INFERENCE_EVERY              = 15     # run AI on every Nth frame
GENDER_CONFIDENCE_THRESHOLD  = 0.60  # 60% majority needed for gendered ad
AGE_CONFIDENCE_THRESHOLD     = 0.60  # 60% majority needed for age-targeted ad
VISITOR_SIMILARITY_THRESHOLD = 0.50  # face similarity threshold for unique visitor
VISITOR_EXPIRE_SECONDS       = 300   # forget a face after 5 min
USE_GPU                      = False # set True if you have onnxruntime-gpu + CUDA
```

---

## API endpoints

The backend runs at `http://localhost:8000`

| Endpoint | Description |
|---|---|
| `GET /api/v1/analytics/live` | Latest snapshot |
| `GET /api/v1/analytics/history` | Last N rows |
| `GET /api/v1/analytics/summary` | Averages over time |
| `GET /api/v1/analytics/dwell` | Dwell session data |
| `GET /api/v1/cameras` | List of cameras |
| `GET /api/v1/alerts` | Low engagement events |
| `GET /api/v1/export?date=YYYY-MM-DD` | Download CSV |
| `GET /api/v1/health` | Health check |
| `WS  /ws/live` | Real-time WebSocket stream |
| `GET /docs` | Interactive API docs |

---

## Tech stack

| Layer | Technology |
|---|---|
| Camera | OpenCV |
| Face AI | InsightFace buffalo_l (ONNX) |
| Emotion AI | FerPlus ONNX (8 emotion classes) |
| Gaze detection | OpenCV solvePnP (head pose) |
| Unique visitors | ArcFace 512-dim embeddings + cosine similarity |
| Backend | Python + FastAPI + Uvicorn |
| Database | SQLite (default) / PostgreSQL (optional) |
| Realtime | WebSocket |
| Dashboard | React + Vite + Tailwind CSS + Recharts |

---

## Troubleshooting

**Camera not opening**
- Make sure no other app is using the camera
- Try changing `CAMERA_INDEX = 1` in pipeline.py

**InsightFace download stuck**
- First run downloads ~300MB of models — wait for it to finish

**WebSocket not connecting**
- Make sure pipeline.py is running before opening the dashboard
- Check that port 8000 is not blocked by a firewall

**Slow inference**
- Increase `INFERENCE_EVERY` to 30 for slower machines
- Set `USE_GPU = True` if you have an NVIDIA GPU with `onnxruntime-gpu` installed
