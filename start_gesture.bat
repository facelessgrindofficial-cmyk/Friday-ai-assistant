@echo off
title Friday Gesture Controller
echo Starting Friday Gesture Control System...
cd /d "%~dp0\backend"
python gesture_controller.py
pause
