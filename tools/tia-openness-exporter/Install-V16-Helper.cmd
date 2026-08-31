@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-PlcAnalysisHelper.ps1" -Version V16
if errorlevel 1 (
  echo.
  echo Installation failed. Confirm TIA Portal V16 PublicAPI and .NET SDK are installed.
  pause
  exit /b 1
)
echo.
echo PLC Analysis Helper V16 is ready. Use the desktop shortcut to export .plcai files.
pause
