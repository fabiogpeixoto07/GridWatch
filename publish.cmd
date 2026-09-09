@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo        GridWatch - Build and IIS Publishing
echo ============================================================
echo.

echo This script prepares the project, validates the Sites build, and publishes IIS.
echo ChatGPT Sites production deployment is completed by the Sites publishing workflow.
echo.

where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: Windows PowerShell 5.1 or later is required to publish to IIS.
  pause
  exit /b 1
)

if not exist "%~dp0scripts\Publish-IIS.ps1" (
  echo ERROR: scripts\Publish-IIS.ps1 was not found. Run publish.cmd from a complete GridWatch checkout.
  pause
  exit /b 1
)

if not exist "%~dp0package.json" (
  echo ERROR: package.json was not found. Run publish.cmd from a complete GridWatch checkout.
  pause
  exit /b 1
)

if not exist "%~dp0package-lock.json" (
  echo ERROR: package-lock.json was not found. Exact dependency installation cannot be guaranteed.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0scripts\Publish-IIS.ps1" %*
set "RESULT=%ERRORLEVEL%"

if not "%RESULT%"=="0" (
  echo.
  echo A publicacao nao foi concluida. Consulte a mensagem acima.
  pause
  exit /b %RESULT%
)

echo.
echo Publication completed successfully.
exit /b 0
