@echo off
echo Starting CampusAI Backend...
cd /d "%~dp0"
venv\Scripts\python.exe -m uvicorn API:app --host 0.0.0.0 --reload
pause
