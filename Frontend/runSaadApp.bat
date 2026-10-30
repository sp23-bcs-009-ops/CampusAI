@echo off
setlocal enabledelayedexpansion

REM Get the script directory
set "SCRIPT_DIR=%~dp0"
set "IMAGE_NAME=campusai-expo"

REM Find the laptop's active LAN/Wi-Fi IP so Expo Go can reach Metro from a phone.
for /f "delims=" %%I in ('powershell -NoProfile -Command "foreach ($config in Get-NetIPConfiguration) { if ($config.IPv4DefaultGateway -and $config.NetAdapter.Status -eq 'Up' -and $config.IPv4Address) { $config.IPv4Address.IPAddress; break } }"') do set "HOST_IP=%%I"

if "%HOST_IP%"=="" (
    echo Error: Could not detect your LAN IP address.
    pause
    exit /b 1
)

REM Build Docker image
echo Building Docker image: %IMAGE_NAME%
docker build --network=host -t "%IMAGE_NAME%" "%SCRIPT_DIR%."
if errorlevel 1 (
    echo Error: Docker build failed
    pause
    exit /b 1
)

REM Run Docker container
echo Running Docker container...
echo Expo will use LAN IP: %HOST_IP%
echo Web browser helper is waiting for Expo Web at http://localhost:8081
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%SCRIPT_DIR%openExpoWeb.ps1" -Url "http://localhost:8081"
docker run --rm -it ^
    -e "REACT_NATIVE_PACKAGER_HOSTNAME=%HOST_IP%" ^
    -e "EXPO_PUBLIC_API_HOST=%HOST_IP%" ^
    -p 8081:8081 ^
    -p 19000:19000 ^
    -p 19001:19001 ^
    -p 19002:19002 ^
    -p 19006:19006 ^
    "%IMAGE_NAME%"
if errorlevel 1 (
    echo Error: Docker run failed
    pause
    exit /b 1
)

echo Docker container completed successfully
pause
