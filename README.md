# Smart Audience Analysis — System Architecture

A real-time audience analytics system that uses Vision LLMs to analyze camera feeds and display insights on a live dashboard.

---

## System Architecture

```mermaid
graph TB
    subgraph Input["📷 Input Layer"]
        CAM[Camera\nRTSP Stream]
    end

    subgraph Ingestion["🎞️ Frame Ingestion"]
        OCV[OpenCV\nFrame Extraction]
        FQ[Frame Queue\nBuffer]
    end

    subgraph Inference["🧠 Vision Inference"]
        VLLM[Vision LLM\nQwen-VL / GPT-4 Vision]
        PR[Prompt Router\nAge · Gender · Emotion · Count]
    end

    subgraph Processing["⚙️ Analytics Processing"]
        AGG[Aggregation Engine]
        ANLT[Analytics Processor\nTrend · Dwell · Heatmap]
        CACHE[Redis Cache\nReal-time State]
    end

    subgraph Backend["🚀 FastAPI Backend"]
        API[REST API\n/metrics · /stream · /export]
        WS[WebSocket\nLive Feed]
        AUTH[Auth Middleware\nJWT]
    end

    subgraph Storage["🗄️ Storage Layer"]
        PG[(PostgreSQL\nAudience Records)]
        TS[(TimescaleDB\nTime-series Metrics)]
    end

    subgraph Frontend["📊 React Dashboard"]
        DASH[React App]
        CHART[Chart.js\nLine · Bar · Pie · Heatmap]
        LIVE[Live Viewer\nWebSocket Consumer]
    end

    CAM -->|RTSP| OCV
    OCV -->|Frames @ N fps| FQ
    FQ -->|Batch Frames| VLLM
    VLLM -->|Structured JSON| PR
    PR -->|Parsed Insights| AGG
    AGG --> ANLT
    AGG --> CACHE
    ANLT -->|Write Records| PG
    ANLT -->|Write Metrics| TS
    CACHE -->|Hot Data| API
    PG -->|Query Results| API
    TS -->|Aggregated Stats| API
    API --- AUTH
    API -->|HTTP Response| DASH
    WS -->|Push Events| LIVE
    CACHE -->|Live Updates| WS
    DASH --> CHART
    DASH --> LIVE
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Video Input | Camera / RTSP Stream |
| Frame Extraction | OpenCV |
| Vision AI | Qwen-VL / GPT-4 Vision |
| Analytics | Custom Python Engine |
| Cache | Redis |
| Backend | FastAPI + WebSocket |
| Database | PostgreSQL + TimescaleDB |
| Frontend | React + Chart.js |

---

## Data Flow

1. **Camera** streams video over RTSP
2. **OpenCV** extracts frames at N fps into a buffer queue
3. **Vision LLM** analyzes each frame — detects age, gender, emotion, crowd count
4. **Analytics Processor** aggregates insights, computes trends and dwell time
5. **Redis** holds real-time state for instant WebSocket delivery
6. **PostgreSQL / TimescaleDB** stores historical records and time-series metrics
7. **FastAPI** serves REST endpoints and pushes live updates via WebSocket
8. **React Dashboard** visualizes everything with Chart.js charts and live feed
