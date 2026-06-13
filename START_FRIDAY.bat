@echo off
title FRIDAY AI Launcher
cd /d "%~dp0"

echo =======================================================
echo 🔍 STEP 1: Verifying System Dependencies...
echo =======================================================

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org/ and try again.
    pause
    exit /b 1
)
echo [OK] Node.js detected.

:: Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.8+ and try again.
    pause
    exit /b 1
)
echo [OK] Python detected.

:: Check backend node_modules
if not exist "backend\node_modules" (
    echo [WARNING] backend\node_modules not found. Installing dependencies...
    cd backend
    call npm install
    cd ..
    echo [OK] Backend dependencies installed.
) else (
    echo [OK] Backend dependencies detected.
)

:: Check .env in backend or root
if not exist "backend\.env" (
    if not exist ".env" (
        echo [WARNING] .env file is missing! System might fail to load credentials.
        echo Please ensure you create a .env file later if needed.
        timeout /t 3
    )
)

echo =======================================================
echo 🚀 STEP 2: Bootstrapping FRIDAY AI Orchestrator...
echo =======================================================

:: Force kill anything currently holding ports 5001 or 3000 for a clean start
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5001 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>nul

:: Start the launcher.py orchestrator.
:: It handles the live status UI, then hides its console window.
python launcher\launcher.py
