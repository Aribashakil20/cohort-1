# Smart Audience Analysis System

A real-time system that uses a camera to observe the area in front of a digital display and automatically detects anonymous audience traits — without storing video or identifying anyone.

---

## What It Does

The system watches people standing in front of a screen and estimates:

| Trait | How |
|---|---|
| Number of people present | Face detection (InsightFace) |
| Age group (child / youth / adult / middle-aged / senior) | Age estimation model |
| Gender distribution (male / female) | Gender classification model |
| Engagement (are they looking at the screen?) | Detection confidence proxy |
| Dominant ad category to show | Rule-based mapping from age + gender |

Every 10 seconds, a summary row is written to a database. A REST API serves this data to a live React dashboard.

**No video is stored. No individual is tracked. Only anonymous aggregate numbers.**

---

## Project Structure

```
SmartAudienceAnalysis/
│
├── pipeline.py                  ← Run this. Camera + AI + API server in one script
├── progress.md                  ← Full project progress log
│
├── smart-audience-dashboard/    ← React dashboard (Vite + Tailwind + Recharts)
│   ├── src/
│   │   ├── components/          ← StatCard, GenderBar, AgeChart, EngagementGauge, etc.
│   │   ├── hooks/usePolling.js  ← Auto-refresh hook (polls API every 5s)
│   │   └── api.js               ← Axios calls to the FastAPI backend
│   └── package.json
│
├── caffe_models/                ← Caffe model weights (used in model testing phase)
│
├── model_testing/               ← AI model comparison scripts (Steps 1–4)
│   ├── step1_caffe_test.py      ← OpenCV Caffe baseline test
│   ├── step2_deepface_test.py   ← DeepFace test (failed on Windows)
│   ├── step3_insightface_test.py← InsightFace test — selected winner
│   ├── step4_compare.py         ← Side-by-side comparison script
│   ├── step4_comparison.json    ← Comparison results
│   ├── advanced_model_testing.py
│   ├── model_comparison_lowlight.py
│   ├── test_model_robustness.py
│   ├── step1_results/           ← Annotated images + JSON from Caffe
│   ├── step2_results/           ← DeepFace error log
│   └── step3_results/           ← Annotated images + JSON from InsightFace
│
└── utils/
    ├── live_insightface.py      ← Standalone webcam demo (no API, just visual)
    ├── evaluate_model.py
    ├── preprocessing.py
    └── train_age_gender.py
```

---

## Tech Stack

| Layer | Tool | Purpose |
|---|---|---|
| Camera input | OpenCV | Read webcam frames |
| Face detection | InsightFace (buffalo_l, ONNX) | Detect faces, estimate age + gender |
| Inference runtime | ONNX Runtime (CPU) | Run AI models without GPU |
| Database | SQLite | Store one analytics row every 10 seconds |
| API server | FastAPI + Uvicorn | Serve analytics data as JSON |
| Dashboard | React + Vite + Tailwind + Recharts | Live charts and metrics |
| Threading | Python threading | Camera, inference, and API run simultaneously |

---

## How to Run

### Step 1 — Install Python dependencies

```bash
pip install insightface onnxruntime opencv-python fastapi uvicorn numpy
```

### Step 2 — Start the pipeline (camera + AI + API server)

```bash
python pipeline.py
```

This will:
- Load the InsightFace model (takes ~10 seconds on first run)
- Open your webcam
- Start the API server at `http://localhost:8000`
- Show a live camera window with face detection overlay

### Step 3 — Start the dashboard

Open a second terminal:

```bash
cd smart-audience-dashboard
npm install
npm run dev
```

Then open `http://localhost:5173` in your browser.

---

## API Endpoints

Base URL: `http://localhost:8000`

Interactive docs: `http://localhost:8000/docs`

| Endpoint | Method | What it returns |
|---|---|---|
| `/api/v1/health` | GET | Server + database status |
| `/api/v1/analytics/live` | GET | Most recent 10-second summary row |
| `/api/v1/analytics/history?limit=30` | GET | Last N rows in time order (for charts) |
| `/api/v1/analytics/summary?limit=30` | GET | Averages across last N rows |

Example response from `/api/v1/analytics/live`:
```json
{
  "id": 42,
  "timestamp": "2026-04-12T16:30:00Z",
  "viewer_count": 3,
  "male_count": 2,
  "female_count": 1,
  "male_pct": 0.667,
  "female_pct": 0.333,
  "age_child_pct": 0.0,
  "age_youth_pct": 0.333,
  "age_adult_pct": 0.667,
  "age_middle_aged_pct": 0.0,
  "age_senior_pct": 0.0,
  "dominant_age_group": "adult",
  "engagement_rate": 0.667,
  "dominant_ad": "Cars / Finance"
}
```

---

## Ad Category Mapping

The system automatically maps the current audience profile to a recommended ad category:

| Age Group | Male | Female |
|---|---|---|
| Child | Toys / Boys Games | Toys / Girls Games |
| Youth (13–24) | Gaming / Sports | Fashion / Beauty |
| Adult (25–45) | Cars / Finance | Lifestyle / Travel |
| Middle-aged (46–60) | Health / Home Appliances | Skincare / Wellness |
| Senior (61+) | Healthcare / Insurance | Healthcare / Insurance |

---

## Model Selection — Why InsightFace

We tested three models against 7 real images before committing to one:

| Model | Faces found | Speed | Status |
|---|---|---|---|
| OpenCV Caffe | 17 | 28.9 ms/img | Works, but mis-buckets adults as children |
| DeepFace | 0 | — | Failed on Windows (HDF5 file error) |
| InsightFace (buffalo_l) | 26 | 4,651 ms/img | Selected — most accurate, numeric ages |

InsightFace found 53% more faces than Caffe and returns numeric ages (e.g. 34) instead of coarse buckets. Full comparison: `model_testing/step4_comparison.json`.

---

## What Has Been Built

- [x] Live camera capture (OpenCV)
- [x] InsightFace face detection, age estimation, gender classification
- [x] Background inference thread (camera stays smooth at 30fps)
- [x] Result smoothing across 3 inference cycles for stable data
- [x] Age group classification (5 buckets)
- [x] Gender distribution (male %, female %)
- [x] Engagement proxy (detection confidence as looking-at-screen indicator)
- [x] Ad category recommendation engine
- [x] SQLite database — one row every 10 seconds
- [x] Thread-safe DB reads/writes (Lock)
- [x] FastAPI REST API — 4 endpoints
- [x] React dashboard — live charts, gender bar, engagement gauge, age breakdown, ad card
- [x] Windows asyncio fix for Uvicorn in background thread
- [x] DB schema migration (works on existing and new databases)

---

## What Is Next

- [ ] Real gaze detection — replace detection confidence proxy with a dedicated gaze model (e.g. L2CS-Net) for accurate "is this person looking at the screen?" signal
- [ ] Dwell time tracking — estimate how long each visitor stays in frame using population-level counting (no individual tracking)
- [ ] RTSP / IP camera support — replace webcam with a network camera stream
- [ ] Switch SQLite to PostgreSQL — for multi-camera and production deployments
- [ ] Multi-camera support — run one pipeline instance per camera, merge into unified dashboard

---

## Privacy

- No video is saved at any point
- No individual face images are stored
- No person is tracked across frames
- Every database row contains only aggregate numbers (counts and percentages)
- The system cannot identify who anyone is
