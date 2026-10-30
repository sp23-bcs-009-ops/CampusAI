@echo off
REM ════════════════════════════════════════════════════════════════
REM  Campus AI — one-click launcher (Windows)
REM  Starts the backend (FastAPI) + the app (Expo web) and opens it.
REM ════════════════════════════════════════════════════════════════
title Campus AI Launcher
cd /d "%~dp0"

echo.
echo  ============================================
echo    Campus AI - starting everything...
echo  ============================================
echo.

REM Backend is Docker-only; do not install or execute Python on the host.
docker build -t campusai-backend backend
if errorlevel 1 (
    echo  ERROR: Docker backend image build failed.
    pause
    exit /b 1
)
docker run --rm -d --name campusai-backend-launcher --env-file backend\.env -p 8000:8000 -v "%CD%\backend\ocr_data:/data" campusai-backend
if errorlevel 1 (
    echo  ERROR: Docker backend failed to start.
    pause
    exit /b 1
)

REM Install declared frontend dependencies only when absent.
if not exist "Frontend\node_modules" (
    pushd Frontend
    call npm install --legacy-peer-deps --no-audit --no-fund
    if errorlevel 1 (
        echo  ERROR: Frontend dependency installation failed.
        popd & pause & exit /b 1
    )
    popd
)

REM Start the app (Expo web).
echo  [4/4] Starting the app on http://localhost:19006 ...
start "Campus AI App" cmd /k "cd /d %~dp0Frontend && npx expo start --web --port 19006"
echo  Backend container is running as campusai-backend-launcher.
echo  Close this window to stop the backend container.

echo.
echo  ============================================
echo    All started!
echo    App:      http://localhost:19006
echo    Backend:  http://localhost:8000/health
echo    API docs: http://localhost:8000/docs
echo.
echo    (Optional^) Admin dashboard:
echo       cd dashboard ^&^& npm install ^&^& npm run dev
echo  ============================================
echo.
pause
docker stop campusai-backend-launcher >nul
