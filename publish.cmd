@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo        GridWatch - Instalation and IIS Publishing
echo ============================================================
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
