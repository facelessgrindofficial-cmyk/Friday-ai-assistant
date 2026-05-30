@echo off
title Friday AI Assistant - Startup
echo ==========================================
echo       STARTING FRIDAY AI ASSISTANT       
echo ==========================================
echo.
echo Starting Backend Server in a new window...
start "Friday Backend" cmd /k "cd /d "%~dp0..\backend" && npm run dev"

echo.
echo Starting Frontend (Next.js) in a new window...
start "Friday Frontend" cmd /k "cd /d "%~dp0..\frontend" && npm run dev"

echo.
echo ==========================================
echo Both services are starting. 
echo - Backend: http://localhost:5000 (or configured port)
echo - Frontend: http://localhost:3000
echo ==========================================
echo You can close this window now.
pause
