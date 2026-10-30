@echo off
setlocal enabledelayedexpansion

REM Get the script directory
set "SCRIPT_DIR=%~dp0"
set "IMAGE_NAME=campusai-expo"

REM Build Docker image
echo Building Docker image: %IMAGE_NAME%
docker build --network=host -t "%IMAGE_NAME%" "%SCRIPT_DIR%"
if errorlevel 1 (
    echo Error: Docker build failed
    pause
    exit /b 1
)

REM Run Docker container
echo Running Docker container...
docker run --rm --network=host -it "%IMAGE_NAME%"
if errorlevel 1 (
    echo Error: Docker run failed
    pause
    exit /b 1
)

echo Docker container completed successfully
pause