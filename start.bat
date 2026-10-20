@echo off
chcp 65001 >nul
cd /d "%~dp0"
title EverStreamer

rem ---- Node.js があるか確認 / Check Node.js ----
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [!] Node.js が見つかりません。 / Node.js is not installed.
  echo       https://nodejs.org/ から LTS 版をインストールしてから、もう一度このファイルを開いてください。
  echo       Install the LTS version from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)
for /f "tokens=1 delims=v." %%v in ('node -v') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 18 (
  echo   [!] Node.js 18 以上が必要です(いまは v%NODE_MAJOR%)。 / Node.js 18 or newer is required.
  pause
  exit /b 1
)

rem ---- 初回だけ部品を入れる / Install dependencies on first run ----
if not exist "node_modules\express\package.json" goto install
if not exist "node_modules\ws\package.json" goto install
goto run
:install
echo   初回の準備をしています(1〜2分かかります)… / Installing dependencies (first run)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo   [!] npm install に失敗しました。インターネットの接続を確認してください。 / npm install failed.
  pause
  exit /b 1
)

:run
if "%PORT%"=="" set PORT=3000
set SOK_OPEN=1
node server.js
echo.
echo   終了しました。 / Stopped.
pause
