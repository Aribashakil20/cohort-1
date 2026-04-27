#!/bin/bash
echo "================================================"
echo " SmartAudienceAnalysis - Setup"
echo "================================================"
echo ""

# Check Python
if ! command -v python3 &>/dev/null; then
    echo "[ERROR] Python3 is not installed."
    echo "Install from: https://www.python.org/downloads/"
    exit 1
fi
echo "[OK] Python found."

# Check Node
if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js is not installed."
    echo "Install from: https://nodejs.org/"
    exit 1
fi
echo "[OK] Node.js found."

# Virtual environment
echo ""
echo "[1/3] Creating Python virtual environment..."
python3 -m venv venv
echo "[OK] Virtual environment created."

# Python packages
echo ""
echo "[2/3] Installing Python packages..."
source venv/bin/activate
pip install --quiet -r requirements.txt
echo "[OK] Python packages installed."

# Node packages
echo ""
echo "[3/3] Installing dashboard packages..."
cd smart-audience-dashboard
npm install --silent
cd ..
echo "[OK] Dashboard packages installed."

echo ""
echo "================================================"
echo " Setup complete! Run: bash start.sh"
echo "================================================"
