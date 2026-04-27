@echo off
echo ================================================
echo  SmartAudienceAnalysis - Setup
echo ================================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed.
    echo Download from: https://www.python.org/downloads/
    pause
    exit /b 1
)
echo [OK] Python found.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js found.

:: Create virtual environment
echo.
echo [1/3] Creating Python virtual environment...
python -m venv venv
echo [OK] Virtual environment created.

:: Install Python dependencies
echo.
echo [2/3] Installing Python packages (this may take a few minutes)...
call venv\Scripts\activate.bat
pip install --quiet -r requirements.txt
echo [OK] Python packages installed.

:: Install Node dependencies
echo.
echo [3/3] Installing dashboard packages...
cd smart-audience-dashboard
call npm install --silent
cd ..
echo [OK] Dashboard packages installed.

echo.
echo ================================================
echo  Setup complete! Run start.bat to launch.
echo ================================================
pause
