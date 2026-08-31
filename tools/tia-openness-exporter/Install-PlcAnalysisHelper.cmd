@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo       PLC解析助手安装程序
echo ========================================
echo 1. 本机 / TIA Portal V17
echo 2. 虚拟机 / TIA Portal V16
echo.
set /p choice=请输入 1 或 2：
if "%choice%"=="1" set "version=V17"
if "%choice%"=="2" set "version=V16"
if not defined version (
  echo 选择无效。
  pause
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-PlcAnalysisHelper.ps1" -Version %version%
if errorlevel 1 (
  echo.
  echo 安装失败：请确认这台电脑已安装对应版本 TIA Portal / Openness，并已加入 Siemens TIA Openness 用户组。
  pause
  exit /b 1
)
echo.
echo 安装完成。以后双击桌面的“PLC解析助手 %version%”即可。
pause
