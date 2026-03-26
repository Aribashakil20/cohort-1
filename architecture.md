Our system follows a modular pipeline architecture where video from the camera is processed using computer vision models to extract audience insights. The results are processed by backend services, stored in a database, and visualized through a dashboard.
------------------------------------------------------------------------

Final Tech Stack (Layer by Layer)

1️⃣ Input Layer
Purpose: Capture video.
Technology:
IP Camera / Webcam
RTSP
The system captures live video using an IP camera that streams video using RTSP protocol.

--------------------------------------------------------------------------

2️⃣ Video Processing Layer

Purpose: Convert video → frames.
Technology:
OpenCV
We use OpenCV to connect to the RTSP stream and extract frames from the video for further processing.

-------------------------------------------------------------------------

3️⃣ AI Inference Layer
Purpose: Analyze audience.
Technologies:
Person Detection
YOLOv8
Face / Landmark Detection
MediaPipe
Deep Learning Framework
PyTorch
The AI inference layer uses YOLOv8 for real-time person detection. After detecting people, MediaPipe is used for facial landmarks which helps estimate attributes such as age group, gender, and attention direction.

--------------------------------------------------------------------------

4️⃣ Backend Layer
Purpose: Manage APIs and system logic.
Technology:
FastAPI

FastAPI is used to build backend services that receive inference results, compute analytics, and expose APIs for the dashboard.

--------------------------------------------------------------------------

5️⃣ Storage Layer
Purpose: Store analytics data.
Technology:
PostgreSQL

PostgreSQL will store aggregated audience analytics such as viewer count, gender distribution, and engagement metrics.

-------------------------------------------------------------------------

6️⃣ Dashboard Layer
Purpose: Show insights visually.
Technologies:
Frontend Framework
React
Charts
Chart.js
The frontend dashboard will be built using React and Chart.js to visualize audience analytics in real time.

------------------------------------------------------------------------

 — Data Flow 


The system begins by capturing video from the camera. OpenCV extracts frames from the video stream. These frames are passed to the AI models where YOLOv8 detects people. Each detected person is analyzed further for demographic attributes and attention estimation. The processed results are sent to backend services where analytics are computed and stored in PostgreSQL. Finally, the dashboard retrieves this data through APIs and visualizes the audience insights.
Simple pipeline:
Camera
↓
RTSP stream
↓
OpenCV frame extraction
↓
YOLOv8 detection
↓
Attribute estimation
↓
Backend processing
↓
Database storage
↓
Dashboard visualization
--------------------------------------------------------------------------
Model Pipeline & Inference Workflow



Each frame from the video stream goes through a model pipeline. First YOLOv8 detects people in the frame and returns bounding boxes. Each detected person region is cropped and passed to additional models that estimate attributes like age group, gender, and attention direction. These predictions are aggregated to generate audience-level analytics such as total viewers and engagement rate.


Pipeline:
Frame
↓
YOLOv8 → detect people
↓
Crop each person
↓
Face detection
↓
Age & gender estimation
↓
Attention estimation
↓
Aggregate results
-------------------------------------------------------------------------
— Backend APIs


Example APIs:

Get Audience Count

GET /audience/count

Get Demographics

GET /audience/demographics

Get Engagement Metrics

GET /engagement



The backend exposes REST APIs that allow the dashboard to fetch audience analytics such as viewer count, demographic distribution, and engagement metrics.
--------------------------------------------------------------------

Implementation Strategy 

Phase 1 — Video Pipeline
Tasks:
Connect camera stream
Extract frames using OpenCV
Test frame pipeline
Phase 2 — AI Model Integration
Tasks:
Implement YOLOv8 detection
Add face landmark detection
Integrate age and gender models
Implement attention estimation
Phase 3 — Backend Development
Tasks:
Build FastAPI backend
Create analytics processing logic
Create REST APIs
Phase 4 — Database Integration
Tasks:
Design PostgreSQL schema
Store analytics data
Implement data queries
Phase 5 — Dashboard Development
Tasks:
Build React dashboard
Add charts using Chart.js
Connect APIs



--------------------------------------------------------------------
We selected this stack because OpenCV and YOLOv8 provide reliable real-time computer vision capabilities. FastAPI enables high-performance backend APIs in Python, and PostgreSQL offers robust structured storage for analytics data. React and Chart.js provide an efficient way to build interactive dashboards.