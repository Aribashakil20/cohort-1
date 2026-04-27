#!/bin/bash
echo "================================================"
echo " SmartAudienceAnalysis - Starting..."
echo "================================================"

# Activate venv and start pipeline in background
echo "[1] Starting AI pipeline..."
source venv/bin/activate
python pipeline.py &
PIPELINE_PID=$!
echo "[OK] Pipeline started (PID: $PIPELINE_PID)"

# Wait for pipeline to boot
echo "[2] Waiting for pipeline to start..."
sleep 5

# Start dashboard
echo "[3] Starting dashboard..."
cd smart-audience-dashboard
npm run dev &
DASHBOARD_PID=$!
cd ..

echo ""
echo "================================================"
echo " Both services running!"
echo " Open: http://localhost:5173"
echo " Press Ctrl+C to stop everything."
echo "================================================"

# Wait and clean up on exit
trap "kill $PIPELINE_PID $DASHBOARD_PID 2>/dev/null; exit" INT
wait
