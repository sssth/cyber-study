@echo off
setlocal
cd /d "%~dp0"

rem Windows 版 PDF 转换组件安装脚本，对应 macOS 的「安装 PDF 转换组件.command」。
set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=.user-data"
set "DEPS=%TARGET%\pdf-text-deps"

if not "%CYBER_STUDY_PYTHON%"=="" (
  set "PYTHON_BIN=%CYBER_STUDY_PYTHON%"
) else (
  set "PYTHON_BIN=python"
)

"%PYTHON_BIN%" -m pip install --upgrade --target "%DEPS%" -r electron\pdf-requirements.txt
if errorlevel 1 goto fail

for /f "usebackq delims=" %%P in (`"%PYTHON_BIN%" -c "import sys;print(sys.executable)"`) do set "PYTHON_PATH=%%P"
> "%DEPS%\.python-path" echo %PYTHON_PATH%

echo.
echo PDF 转换组件安装完成：%DEPS%
pause
exit /b 0

:fail
echo.
echo PDF 转换组件安装失败，请先安装 Python 3.10 或更高版本并确认 pip 可用。
pause
exit /b 1
