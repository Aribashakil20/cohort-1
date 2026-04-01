# Smart Audience Analysis System

A real-time system that uses a camera to count people in front of a digital display, estimate their age group and gender, and detect whether they are looking at the screen — all without storing any video or identifying anyone.

---

## Table of Contents

1. [Technologies Used in Each Layer](#1-technologies-used-in-each-layer)
2. [Data Flow Across the Pipeline](#2-data-flow-across-the-pipeline)
3. [Model Pipeline & Inference Workflow](#3-model-pipeline--inference-workflow)
4. [Backend Services & APIs](#4-backend-services--apis)

---

## 1. Technologies Used in Each Layer

The system is split into 7 layers. Each layer has one job and uses specific tools to do it.

---

### Layer 1 — Camera Input

| What | Tool |
|---|---|
| Camera | Any IP camera that supports RTSP (a standard video streaming format) |
| How video travels | RTSP — sends live video over your local network |

**In plain words:** The camera streams live video to the computer over your local Wi-Fi or cable network. No video is sent to the internet.

---

### Layer 2 — Reading and Preparing Video Frames

| What | Tool |
|---|---|
| Opening the video stream | OpenCV (`cv2.VideoCapture`) |
| Pulling individual images (frames) out | OpenCV frame loop |
| Resizing and adjusting images | OpenCV + NumPy |
| Keeping capture and processing separate | Python threading |

**In plain words:** Think of the video stream as a filmstrip. This layer pulls individual still images (frames) from it at 5 per second, resizes them, and prepares them for the AI models.

---

### Layer 3 — AI Models (Finding and Analyzing People)

| What | Tool |
|---|---|
| Spotting people in the image | YOLOv8 (via the `ultralytics` Python library) |
| Guessing age group | A pre-trained AI model (e.g., DEX or MiVOLO) |
| Guessing gender | A lightweight classification model |
| Detecting if someone is looking at the screen | A gaze estimation model (e.g., L2CS-Net) |
| Running all models efficiently | ONNX Runtime or PyTorch (with optional GPU speed-up) |

**In plain words:** YOLOv8 draws a box around each person in the image. Then three more models look at each person's crop to guess their age group, gender, and whether they are looking at the display.

---

### Layer 4 — Counting and Summarizing Results

| What | Tool |
|---|---|
| Combining results from many frames | Custom Python logic |
| Tracking how long people stay in view | Python frame counter |
| Calculating what percentage are looking | Python math |
| Saving the summary to the database | SQLAlchemy (a Python database library) |

**In plain words:** Instead of saving results for every single image, this layer waits 10 seconds, then averages everything into one summary record — like "4 people seen, 75% were looking, 50% female."

---

### Layer 5 — Backend (The Data Server)

| What | Tool |
|---|---|
| Web server that handles requests | FastAPI (Python) |
| Running that web server | Uvicorn |
| Reading/writing to the database | SQLAlchemy |
| Making sure data is in the right format | Pydantic |

**In plain words:** The backend is like a waiter. The dashboard asks "what's the latest data?" and the backend goes to the database, fetches the answer, and sends it back as JSON.

---

### Layer 6 — Database (Storage)

| What | Tool |
|---|---|
| Database | PostgreSQL |
| Managing database structure changes | Alembic |
| Handling multiple reads/writes at once | SQLAlchemy connection pool |

**In plain words:** PostgreSQL stores one row of numbers every 10 seconds — things like headcount, engagement rate, and age breakdown. No images, no video, no names.

---

### Layer 7 — Dashboard (What You See)

| What | Tool |
|---|---|
| Web interface | React |
| Charts and graphs | Chart.js |
| Fetching data from the backend | Axios |
| Auto-refresh every 5–10 seconds | JavaScript `setInterval` |
| Page layout and styling | Tailwind CSS |

**In plain words:** The dashboard is a webpage with live-updating charts. It automatically asks the backend for fresh data every few seconds and redraws the charts.

---

## 2. Data Flow Across the Pipeline

Here is the exact journey from camera to dashboard, step by step.

---

**Step 1 — Camera sends video**
The IP camera streams live video to the computer over the local network using RTSP.

**Step 2 — Pull a frame**
OpenCV reads the video stream and extracts one still image every 6th frame (about 5 times per second).

**Step 3 — Prepare the image**
The image is resized to 640×640 pixels, colors are adjusted, and pixel values are normalized — this is what the AI models expect as input.

**Step 4 — Find people (YOLOv8)**
YOLOv8 scans the image and draws a bounding box around every person it finds. Each box has an `(x, y, width, height)` coordinate.

**Step 5 — Crop each person**
For each bounding box, the system cuts out just that person's region from the original image. These crops are small images of each individual person.

**Step 6 — Run 3 models on each crop**
- Age model → outputs a label like `"young_adult"`
- Gender model → outputs `"male"` or `"female"`
- Gaze model → outputs `"looking"` or `"not_looking"`

**Step 7 — Assemble frame results**
All per-person results are grouped into one dictionary for that frame. The image crops are immediately thrown away — they are never saved.

**Step 8 — Aggregate every 10 seconds**
After 10 seconds of frames, all frame results are combined into one summary record:
- Average headcount
- % male / female
- % in each age group
- Engagement rate (how many were looking)
- Average time people stayed in frame

**Step 9 — Save to database**
The summary record is inserted as one row into PostgreSQL.

**Step 10 — Dashboard requests data**
The React dashboard sends a request to the FastAPI backend every 5–10 seconds.

**Step 11 — Backend fetches and responds**
FastAPI queries PostgreSQL for the latest row and sends it back as JSON.

**Step 12 — Dashboard updates charts**
React receives the JSON and redraws all charts with the fresh numbers.

---

## 3. Model Pipeline & Inference Workflow

This section explains exactly what each AI model does and how they are connected.

---

### Step 1 — Person Detection (YOLOv8)

**What it gets:** A resized image of the full camera frame.

**What it does:** Scans the image for people and draws a box around each one.

**What it outputs:** A list of boxes — `[(x1, y1, x2, y2)]` — one per person detected.

**Rules:**
- Only looks for people (ignores chairs, bags, etc.)
- Ignores detections it is less than 50% confident about
- Ignores boxes smaller than 30×30 pixels (too far away to analyze reliably)

---

### Step 2 — Crop Each Person

**What it does:** Uses each box coordinate to cut out just that person's region from the original full image. Adds a small 10-pixel border around the box to include a bit of context.

**What it outputs:** A list of small cropped images — one per person.

The crops exist only in memory for a fraction of a second and are never written to disk.

---

### Step 3 — Age Group Estimation

**What it gets:** A 224×224 pixel crop of one person.

**What it does:** The model estimates the person's age as a number (e.g., 27.4 years) and maps it to one of four buckets:

| Age Range | Label |
|---|---|
| 0–12 | `child` |
| 13–35 | `young_adult` |
| 36–60 | `adult` |
| 61+ | `senior` |

**What it outputs:** One label, e.g., `"young_adult"`.

---

### Step 4 — Gender Estimation

**What it gets:** A 224×224 pixel crop of one person.

**What it does:** Classifies the person as `"male"` or `"female"` with a confidence score.

**What it outputs:** One label and a confidence score.

**Rule:** If confidence is below 65%, the result is excluded from the gender percentage calculation (but the person is still counted in the headcount).

---

### Step 5 — Gaze / Attention Detection

**What it gets:** A 224×224 pixel crop of the person's face or upper body.

**What it does:** Estimates which direction the person is looking. If their gaze is pointed roughly toward the camera (within ±25° left/right and ±20° up/down), they are classified as looking at the display.

**What it outputs:** `"looking"` or `"not_looking"`.

**Engagement rate formula:**
```
engagement_rate = (number of people looking) / (total people detected)
```

---

### Step 6 — Dwell Time Estimation

**What it does:** Estimates, on average, how many seconds people stayed in front of the display during the 10-second window — without tracking any individual person across frames.

**Formula (simplified):**
```
avg_dwell_time = (average headcount × window duration) / (estimated number of arrivals)
```

This gives a rough population-level estimate without identifying or re-identifying anyone.

---

### Full Inference Flow (Visual Summary)

```
Camera Frame
     │
     ▼
[ YOLOv8 ] → finds N people → [ Box_1, Box_2, ..., Box_N ]
     │
     ├── For each person box:
     │       ├── Crop the person out of the frame
     │       ├── Age Model    → "young_adult"
     │       ├── Gender Model → "female"
     │       └── Gaze Model   → "looking"
     │
     ▼
Per-frame result (held in memory, never saved)
     │
     ▼ (every 10 seconds)
Analytics Aggregator → one summary record
     │
     ▼
PostgreSQL (one row of numbers, no images)
     │
     ▼
FastAPI → JSON
     │
     ▼
React Dashboard → updated charts
```

---

## 4. Backend Services & APIs

The backend is a Python web server that sits between the database and the dashboard. It has one job: answer questions from the dashboard by fetching data from the database.

---

### Tools Used

| Tool | What It Does |
|---|---|
| **FastAPI** | The web framework — handles incoming HTTP requests and sends back responses |
| **Uvicorn** | The server process that actually runs FastAPI and listens on port 8000 |
| **SQLAlchemy** | Talks to the PostgreSQL database using Python code instead of raw SQL |
| **Pydantic** | Makes sure every API response has the exact right fields and data types |
| **CORS Middleware** | Allows the React dashboard (on port 3000) to talk to the backend (on port 8000) — browsers block this by default |

---

### API Endpoints

The backend exposes 4 URLs the dashboard can call:

---

#### `GET /api/v1/analytics/live`
**What it does:** Returns the single most recent summary record from the database.

**Used for:** The live panel on the dashboard — refreshed every 5–10 seconds.

**Example response:**
```json
{
  "timestamp": "2026-03-09T14:32:00Z",
  "total_count": 4,
  "gender_male_pct": 0.50,
  "gender_female_pct": 0.50,
  "age_young_adult_pct": 0.75,
  "age_adult_pct": 0.25,
  "engagement_rate": 0.75,
  "avg_dwell_time_sec": 8.4
}
```

---

#### `GET /api/v1/analytics/history`
**What it does:** Returns a list of records between a start and end time.

**Used for:** Time-series line charts showing how audience metrics changed over time.

**Parameters you can pass:**
- `start` — beginning of the time range
- `end` — end of the time range
- `camera_id` — optional, filter by a specific camera
- `interval` — optional, group by `1m`, `5m`, or `1h`

---

#### `GET /api/v1/analytics/summary`
**What it does:** Returns averages and totals across a date range — like a daily or weekly report.

**Used for:** Summary cards showing things like "average engagement rate this week."

**Example response:**
```json
{
  "avg_total_count": 3.8,
  "avg_engagement_rate": 0.62,
  "dominant_age_group": "young_adult",
  "avg_dwell_time_sec": 10.2
}
```

---

#### `GET /api/v1/health`
**What it does:** Confirms the backend is running and the database is connected.

**Used for:** Monitoring tools and Docker health checks.

**Example response:**
```json
{
  "status": "ok",
  "database": "connected"
}
```

---

### How the Backend Connects to Everything

```
React Dashboard
      │  asks for data (HTTP GET)
      ▼
  FastAPI (port 8000)
      │  queries database
      ▼
  PostgreSQL
      │  returns rows
      ▼
  FastAPI serializes to JSON
      │
      ▼
React Dashboard receives JSON → updates charts
```

---

### Privacy Note

The backend never serves raw images, video, or any data that could identify a person. Every response contains only numbers — counts, percentages, and timestamps.

---

## 5. Model Testing — Steps 1–4 (Age & Gender Model Comparison)

This section documents the three models we tested for age and gender detection, and the final comparison between them.

---

### Why we tested multiple models

Before committing to one AI model for the live pipeline, we ran three separate models against the same 7 test images so we could compare:

- **How many faces** each model detects (sensitivity)
- **How fast** each model runs (latency)
- **How accurately** each model predicts age group and gender
- **Where each model fails** (small faces, wrong lighting, etc.)

---

### Step 1 — OpenCV Caffe (Levi & Hassner, 2015)

**What it is:** Two pre-trained neural networks bundled with OpenCV. One detects faces using a ResNet-SSD network, then crops each face and passes it to two more networks — one for age, one for gender.

**How it works:**

1. The face detector takes the full image, resizes it to 300×300, and outputs bounding boxes with confidence scores.
2. Each detected face is cropped and resized to 227×227.
3. The age network outputs a probability across **8 fixed buckets**: `(0–2)`, `(4–6)`, `(8–12)`, `(15–20)`, `(25–32)`, `(38–43)`, `(48–53)`, `(60–100)`.
4. The gender network outputs `Male` or `Female` with a confidence score.

**Why this file was created (`step1_caffe_test.py`):**
It is the easiest model to run — OpenCV is already installed and the Caffe weights download automatically. This gives us a baseline to compare everything else against.

**Results (7 images):**

| Metric | Value |
|---|---|
| Total faces detected | 17 |
| Average time per image | 28.9 ms |
| Images with 0 faces | 2 (`image copy 2.png`, `test.jpg`) |
| Small-face warnings | 11 faces flagged as < 32px |

**Where it failed:**
- Missed all 7 faces in `image copy 2.png` (a high-resolution crowd image — faces too small after downscale to 300×300)
- Bucketed 4 adult faces as `(8-12)` child on `image copy.png` and `image.png` — the 8-bucket system is coarse and the model was trained on a small 1990s-era dataset
- All faces in group/crowd images were flagged as too small for reliable prediction

---

### Step 2 — DeepFace

**What it is:** A Python library that wraps multiple face recognition and analysis models behind a single `DeepFace.analyze()` call. Supports detectors: OpenCV, RetinaFace, MTCNN, SSD, Dlib.

**How it works:**

1. `DeepFace.analyze(image_path, actions=['age','gender'])` — one function call.
2. Internally downloads model weights on first use (stored in `~/.deepface/`).
3. Returns a numeric age (e.g. `31`) and gender as `"Man"` / `"Woman"` with confidence.

**Why this file was created (`step2_deepface_test.py`):**
DeepFace offers a higher-level API than raw Caffe. It also provides numeric age (not buckets) and has multiple detector backends to choose from. Testing it tells us if the simpler API is worth the extra dependency.

**Results (7 images):**

| Metric | Value |
|---|---|
| Total faces detected | **0** |
| Average time per image | 2,868.9 ms |
| Images with errors | **All 7** |

**Where it failed:**
Every image failed with:
```
DeepFace error: Unable to synchronously open file (file signature not found)
```
This is a **Windows-specific HDF5 file error** — DeepFace's model weights (`.h5` files) did not open correctly. This is a known issue on some Windows/Anaconda setups where the HDF5 library version mismatches the TensorFlow version. The model never ran inference — all 2,868 ms was wasted on failed I/O.

**Fix (not yet applied):** Reinstall with `pip install deepface tensorflow==2.12` and clear `~/.deepface/weights/`.

---

### Step 3 — InsightFace (buffalo_l, ONNX)

**What it is:** A state-of-the-art face analysis library that uses ONNX Runtime (not TensorFlow/PyTorch). The `buffalo_l` model pack includes RetinaFace for detection and separate ONNX models for age and gender.

**How it works:**

1. `FaceAnalysis(name='buffalo_l')` loads the full model pack.
2. `app.get(image)` runs the complete pipeline: face detection → landmark alignment → age/gender inference.
3. Returns: bounding box, a **numeric age** (e.g. `45`), gender as `Male`/`Female`, and a **detection confidence score** (`det_score`).

**Why this file was created (`step3_insightface_test.py`):**
InsightFace is the current industry standard for face analysis. Its ONNX backend means it runs without GPU and doesn't depend on TensorFlow. Testing it against Caffe tells us if the accuracy improvement is worth the slower speed.

**Results (7 images):**

| Metric | Value |
|---|---|
| Total faces detected | **26** |
| Average time per image | 4,651.9 ms |
| Images with 0 faces | 1 (`test.jpg`) |
| Small-face warnings | 13 faces flagged as < 32px |

**Where it failed:**
- `test.jpg`: same as Caffe — face too far/side-on
- Small faces in crowd images detected but flagged as potentially inaccurate
- First inference was slow (~8,782 ms) because ONNX Runtime compiled the model on first call — subsequent calls were faster

---

### Step 4 — Side-by-Side Comparison

**What this step does (`step4_compare.py`):**
Loads the three result JSON files produced by Steps 1–3 and computes a side-by-side comparison. No new inference is run — this is pure data analysis. The script produces `step4_comparison.json`.

---

#### A. Faces Detected Per Image

| Image | Caffe | DeepFace | InsightFace |
|---|---|---|---|
| image copy 2.png | 0 | FAILED | **7** |
| image copy.png | 4 | FAILED | 4 |
| image.png | 2 | FAILED | 2 |
| OIP (1).jpg | 4 | FAILED | 4 |
| OIP.jpg | 5 | FAILED | 5 |
| group-thumbnail.png | 2 | FAILED | **4** |
| test.jpg | 0 | FAILED | 0 |
| **TOTAL** | **17** | **0** | **26** |

**Key finding:** InsightFace found **53% more faces** overall. The biggest gap was `image copy 2.png` — a high-resolution crowd photo where Caffe found 0 faces (they were too small after downscaling to 300×300) but InsightFace found 7 (it uses 640×640 input).

---

#### B. Speed Per Image

| Model | Avg ms/image | Notes |
|---|---|---|
| **Caffe** | **28.9 ms** | ~35 FPS capable |
| DeepFace | 2,868.9 ms | Failed — time was wasted on I/O errors |
| InsightFace | 4,651.9 ms | ~0.2 FPS — first call slow (ONNX compilation) |

**Caffe is ~161× faster than InsightFace.** However, for a display-audience system that only needs to refresh every 5–10 seconds, InsightFace's speed is still acceptable.

---

#### C. Age Group Agreement (Caffe vs InsightFace)

For images where both models found faces, we compared the predicted age group for each matched face pair:

| Image | Faces compared | Age-group agreement |
|---|---|---|
| image copy.png | 4 | 50% |
| image.png | 2 | **0%** |
| OIP (1).jpg | 4 | 25% |
| OIP.jpg | 5 | 80% |
| group-thumbnail.png | 2 | **0%** |

**Critical finding — Caffe mis-buckets adults as children:**

On `image copy.png` and `image.png`, Caffe predicted `(8-12)` child for faces that InsightFace predicted as adults aged 21–42. The Caffe model was trained on the Adience dataset (2014) which is small and heavily biased toward a few age buckets. The `(8-12)` bucket gets over-predicted on female faces.

InsightFace's numeric predictions (21, 23, 28, 36, 42) are far more plausible for the visible images.

---

#### D. Gender Agreement (Caffe vs InsightFace)

| Image | Faces compared | Gender agreement |
|---|---|---|
| image copy.png | 4 | 75% |
| image.png | 2 | 100% |
| OIP (1).jpg | 4 | 75% |
| OIP.jpg | 5 | 40% |
| group-thumbnail.png | 2 | 100% |

Gender agreement is higher than age but still not perfect — the two models disagree on roughly 30% of faces. Without labeled ground truth, we cannot determine which model is correct.

---

#### E. Where Each Model Fails

| Failure type | Caffe | DeepFace | InsightFace |
|---|---|---|---|
| Small faces (< 32px) | Detects but flags 11 | N/A (failed) | Detects but flags 13 |
| High-res crowd images | Misses all faces (300×300 downscale) | N/A | Detects correctly (640×640) |
| Age mis-prediction | Buckets adults as `(8-12)` child | N/A | Numeric, more plausible |
| File I/O errors | None | All 7 images | None |
| First-call warmup | None | N/A | ~8,000 ms (ONNX compile) |
| Low-light / side-on face | Misses (test.jpg) | N/A | Misses (test.jpg) |

---

#### F. Winner Per Category

| Category | Winner | Reason |
|---|---|---|
| Most faces detected | **InsightFace** | 26 vs 17; handles high-res crowd images |
| Fastest inference | **Caffe** | 28.9 ms/img — 161× faster than InsightFace |
| Age accuracy | **InsightFace** | Numeric ages; no adult-as-child mis-bucketing |
| Gender accuracy | **Inconclusive** | ~30% disagreement; no ground truth available |
| Reliability (no crashes) | **Caffe / InsightFace** | Both ran all 7 images; DeepFace failed all |
| Ease of setup | **Caffe** | Already bundled with OpenCV |
| Small-face detection | **Tie** | Both detect and flag; InsightFace finds more |

---

#### G. Recommendation

**Use InsightFace (`buffalo_l`) as the primary model for the live pipeline.**

Reasons:
1. **Highest recall** — found 26 faces vs Caffe's 17 (53% more). In a real audience-counting system, missed faces = missed data.
2. **Numeric age** — more granular and more accurate than 8 fixed buckets.
3. **No adult-as-child mis-bucketing** — Caffe's biggest quality problem.
4. **Detection confidence score** — `det_score` per face allows filtering unreliable detections.

**Trade-off:** InsightFace is ~161× slower per image.
**Mitigation:** Run on every 15th frame (every 0.5 seconds at 30fps), not every frame. The live dashboard only updates every 5–10 seconds anyway — so inference speed is not a bottleneck.

**DeepFace:** Re-test after fixing the HDF5/Windows model-weights issue. If fixed, its single-function API makes it the easiest to integrate.

---

### Output Files

| File | What it contains |
|---|---|
| `step1_results/step1_caffe_results.json` | Per-face Caffe predictions + annotated images |
| `step2_results/step2_deepface_results.json` | DeepFace error log |
| `step3_results/step3_insightface_results.json` | Per-face InsightFace predictions + annotated images |
| `step4_comparison.json` | Full side-by-side comparison data (generated by Step 4) |

---

*Smart Audience Analysis System — v1.0*
