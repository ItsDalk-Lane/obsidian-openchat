@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0.."

if "%1"=="--debug" (
    echo [Debug Mode] Starting Pi Web Desktop with console output...
    node electron\launcher.js
) else (
    wscript "Pi-Web-Desktop.vbs"
)
