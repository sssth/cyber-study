@echo off
setlocal
cd /d "%~dp0"

rem 双击启动赛博书房 Demo（Windows）。对应 macOS 的「启动赛博书房.command」。
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请先安装 Node.js 20 或更高版本。
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo 未找到 pnpm。请先运行：npm install -g pnpm
  pause
  exit /b 1
)

call pnpm dev
pause
