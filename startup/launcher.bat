@echo off
title Friday Project Launcher
:menu
cls
echo ==================================================
echo              FRIDAY PROJECT LAUNCHER              
echo ==================================================
echo.
echo Please select the project you want to start:
echo [1] Friday AI Assistant (Main)
echo [2] NEET Pomodoro Study Hub
echo [3] Open Instructions Guide (README.md)
echo [4] Exit
echo.
set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" (
    call "%~dp0start_friday.bat"
    goto menu
)
if "%choice%"=="2" (
    call "%~dp0start_pomodoro.bat"
    goto menu
)
if "%choice%"=="3" (
    start "" "%~dp0README.md"
    goto menu
)
if "%choice%"=="4" (
    exit
)
echo Invalid choice. Please try again.
pause
goto menu
