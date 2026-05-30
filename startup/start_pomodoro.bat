@echo off
title NEET Pomodoro Study Hub - Startup
echo ==========================================
echo       STARTING NEET POMODORO STUDY HUB
echo ==========================================
echo.
echo Starting Backend Server in a new window...
start "Pomodoro Backend" cmd /k "cd /d "%~dp0..\neet\pomodoro\backend" && npm run dev"

echo.
echo Opening Frontend in your default browser...
start "" "%~dp0..\neet\pomodoro\frontend\index.html"

echo.
echo ==========================================
echo Backend runs on http://localhost:5002
echo Frontend is open in your web browser.
echo ==========================================
echo You can close this window now.
pause
