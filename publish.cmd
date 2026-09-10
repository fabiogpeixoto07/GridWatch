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

set "PUBLISH_SCRIPT=%~dp0scripts\Publish-IIS.ps1"

if not exist "%PUBLISH_SCRIPT%" (
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

rem Publish-IIS.ps1 is the single dependency bootstrap: it installs or updates
rem Node.js LTS when needed, then restores the lockfile-defined packages with npm ci.
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed yet. The IIS publisher will install the required LTS version.
) else (
  for /f "tokens=*" %%V in ('node.exe --version') do echo Detected Node.js %%V. The IIS publisher will verify the required version.
)

if not exist "%~dp0node_modules\.bin\vite.cmd" (
  echo Project dependencies are missing or incomplete. The IIS publisher will restore them with npm ci.
) else (
  echo Project dependencies are present. The IIS publisher will verify them before building.
)

echo.
echo Starting the IIS publisher. It will verify Node.js, npm, and locked project dependencies before building.
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%PUBLISH_SCRIPT%" %*
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
