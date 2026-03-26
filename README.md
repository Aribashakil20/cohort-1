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

*Smart Audience Analysis System — v1.0*
