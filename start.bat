@echo off
echo ================================================
echo  SmartAudienceAnalysis - Starting...
echo ================================================
echo.
echo [1] Starting AI pipeline (camera + API)...
start "SmartAudience - Pipeline" cmd /k "call venv\Scripts\activate.bat && python pipeline.py"

echo [2] Waiting for pipeline to start...
timeout /t 5 /nobreak >nul

echo [3] Starting dashboard...
start "SmartAudience - Dashboard" cmd /k "cd smart-audience-dashboard && npm run dev"

echo.
echo ================================================
echo  Both services starting!
echo  Open: http://localhost:5173
echo  Press any key to close this window.
echo  (Keep the other two windows open)
echo ================================================
pause
