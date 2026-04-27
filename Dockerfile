# ── Dockerfile — Smart Audience Analysis Pipeline ──────────────────────────
#
# What this file does:
#   Packages the Python pipeline (camera + AI + FastAPI server) into a
#   portable container image. Run it on any machine with Docker installed —
#   no Python environment setup required.
#
# Why python:3.11-slim?
#   "slim" is the Debian base without docs, manpages, and other extras.
#   Smaller image (~150 MB vs ~900 MB for the full image). InsightFace and
#   OpenCV add their own size so we start lean.
#
# Note on camera access:
#   To use a webcam inside Docker on Linux, run with:
#     docker run --device=/dev/video0 ...
#   For Windows / Mac, use an RTSP IP camera instead (set CAMERA_SOURCE).
#   RTSP cameras work out of the box — no host device passthrough needed.
# ────────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim

# Prevent Python from writing .pyc files and buffering stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system libraries needed by OpenCV (headless — no display required)
# libgl1-mesa-glx:  OpenCV's headless build still links against OpenGL
# libglib2.0-0:     GLib, required by many OpenCV builds
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python dependencies first (Docker layer cache: only
# re-runs pip install when requirements.txt changes, not on code changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY pipeline.py .
COPY utils/ ./utils/

# Create directory for SQLite database and screenshots
RUN mkdir -p /data /app/live_screenshots

# Environment variables — override these with docker run -e or docker-compose
ENV DB_PATH=/data/audience.db
ENV API_HOST=0.0.0.0
ENV API_PORT=8000
# Set CAMERA_SOURCE to an RTSP URL when running in Docker:
# ENV CAMERA_SOURCE=rtsp://admin:password@192.168.1.100:554/stream

EXPOSE 8000

CMD ["python", "pipeline.py"]
