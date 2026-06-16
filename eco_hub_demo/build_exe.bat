@echo off
rem Ensure script runs with administrative privileges (removed)
rem >nul 2>&1 "%SystemRoot%\system32\cacls.exe" "%SystemRoot%\system32\config\system"
rem if %errorlevel% NEQ 0 (
rem   echo Please run this script as Administrator.
rem   pause
rem   exit /b 1
rem )
setlocal
cd /d "%~dp0"
set NAME=EcoHub
set BUILD_DIST_ROOT=dist_build
set BUILD_DIST_DIR=%BUILD_DIST_ROOT%\%NAME%
set FINAL_DIST_DIR=dist\%NAME%
set VERSION=0.0.0
set DEFAULT_RELEASE_DOWNLOAD_URL=https://github.com/j4ngler/EcoHub/releases/latest/download/EcoHub-portable.zip
set DEFAULT_UPDATE_MANIFEST_URL=https://raw.githubusercontent.com/j4ngler/EcoHub/main/eco_hub_demo/release/latest.json
if exist "VERSION" (
  set /p VERSION=<VERSION
)

echo ============================================
echo  EcoHub - build Windows exe (PyInstaller)
echo ============================================

call :clean_dir "build" "build folder"
call :clean_dir "%BUILD_DIST_DIR%" "staging dist output folder"
echo.

if exist ".venv\Scripts\activate.bat" (
  call ".venv\Scripts\activate.bat"
  echo [BUILD] Da kich hoat .venv
) else (
  echo [BUILD] Canh bao: Chua co .venv - tao bang: python -m venv .venv
  echo [BUILD] Tiep tuc bang Python hien tai...
)

python -m pip install -U pip
if errorlevel 1 goto :err

python -m pip install -r requirements.txt pyinstaller
if errorlevel 1 goto :err

if exist "config.key" (
  echo [BUILD] Them config.key vao bundle.
  python -m PyInstaller --noconfirm --distpath "%CD%\%BUILD_DIST_ROOT%" --name %NAME% --onedir --windowed --icon "EcoHub.ico" --collect-all flask --collect-all werkzeug --collect-all cv2 --collect-all numpy --collect-all boto3 --collect-all cryptography --hidden-import zxingcpp --hidden-import botocore --add-data "templates;templates" --add-data "static;static" --add-data "config.json;." --add-data "config.key;." --add-data "VERSION;." app.py
) else (
  echo [BUILD] Khong co config.key - bo qua; app van chay, tao key luc can.
  python -m PyInstaller --clean --noconfirm --distpath "%CD%\%BUILD_DIST_ROOT%" --name %NAME% --onedir --windowed --icon "EcoHub.ico" --collect-all flask --collect-all werkzeug --collect-all cv2 --collect-all numpy --collect-all boto3 --collect-all cryptography --hidden-import zxingcpp --hidden-import botocore --add-data "templates;templates" --add-data "static;static" --add-data "config.json;." --add-data "VERSION;." app.py
)

if errorlevel 1 goto :err

rem Cleanup build folder after PyInstaller
if exist "build" (
    echo [BUILD] Cleaning up build folder post-build
    takeown /F "build" /R /D Y >nul 2>&1
    icacls "build" /grant "%USERNAME%:F" /T /C >nul 2>&1
    rmdir /S /Q "build"
)

echo.
echo [BUILD] Dong goi kem tai lieu giao khach...
if exist "%BUILD_DIST_DIR%" (
  if exist ".env" (
    copy /Y ".env" "%BUILD_DIST_DIR%\.env" >nul
    echo [BUILD]   + .env
  ) else (
    if exist ".env.example" (
      copy /Y ".env.example" "%BUILD_DIST_DIR%\.env" >nul
      echo [BUILD]   + .env (copied from .env.example)
    )
  )
  if exist "%BUILD_DIST_DIR%\.env" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$path = '%CD%\%BUILD_DIST_DIR%\.env'; $line = 'ECOHUB_UPDATE_MANIFEST_URL=%DEFAULT_UPDATE_MANIFEST_URL%'; if (-not (Test-Path -LiteralPath $path)) { exit 0 }; $content = Get-Content -LiteralPath $path -Raw; if ($content -match '(?m)^ECOHUB_UPDATE_MANIFEST_URL=') { $content = [regex]::Replace($content, '(?m)^ECOHUB_UPDATE_MANIFEST_URL=.*$', $line) } elseif ($content -match '(?m)^#\s*ECOHUB_UPDATE_MANIFEST_URL=.*$') { $content = [regex]::Replace($content, '(?m)^#\s*ECOHUB_UPDATE_MANIFEST_URL=.*$', $line) } else { if ($content.Length -gt 0 -and -not $content.EndsWith([Environment]::NewLine)) { $content += [Environment]::NewLine }; $content += $line + [Environment]::NewLine }; Set-Content -LiteralPath $path -Value $content -Encoding UTF8"
    echo [BUILD]   + ECOHUB_UPDATE_MANIFEST_URL=%DEFAULT_UPDATE_MANIFEST_URL%
  )
  if exist "GIAO_KHACH_HANG.txt" (
    copy /Y "GIAO_KHACH_HANG.txt" "%BUILD_DIST_DIR%\GIAO_KHACH_HANG.txt" >nul
    echo [BUILD]   + GIAO_KHACH_HANG.txt
  )
  if exist "updater.ps1" (
    copy /Y "updater.ps1" "%BUILD_DIST_DIR%\updater.ps1" >nul
    echo [BUILD]   + updater.ps1
  )
  if not exist "%BUILD_DIST_DIR%\data\videos" mkdir "%BUILD_DIST_DIR%\data\videos" 2>nul
  if exist "%BUILD_DIST_DIR%\data\videos" (
    echo Kho video portable - EcoHub ghi file vao day.> "%BUILD_DIST_DIR%\data\videos\README.txt"
    echo [BUILD]   + data\videos (portable)
  )
)

if not exist "release" mkdir release
echo [BUILD] Tao file zip (release\EcoHub-portable.zip)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -LiteralPath '%CD%\%BUILD_DIST_DIR%' -DestinationPath '%CD%\release\EcoHub-portable.zip' -Force"
if errorlevel 1 (
  echo [BUILD] Canh bao: khong tao duoc zip - kiem tra PowerShell.
) else (
  echo [BUILD]   + release\EcoHub-portable.zip
)
echo [BUILD] Tao file manifest (release\latest.json)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url = if ($env:ECOHUB_RELEASE_DOWNLOAD_URL) { $env:ECOHUB_RELEASE_DOWNLOAD_URL } else { '%DEFAULT_RELEASE_DOWNLOAD_URL%' }; $notes = if ($env:ECOHUB_RELEASE_NOTES) { $env:ECOHUB_RELEASE_NOTES } else { 'Portable release %VERSION%' }; $obj = [ordered]@{ version = '%VERSION%'; url = $url; notes = $notes; published_at = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK') }; $obj | ConvertTo-Json | Set-Content -LiteralPath '%CD%\release\latest.json' -Encoding UTF8"
if errorlevel 1 (
  echo [BUILD] Canh bao: khong tao duoc release\latest.json
) else (
  echo [BUILD]   + release\latest.json
)

echo [BUILD] Cap nhat file dist.zip...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -LiteralPath '%CD%\%BUILD_DIST_DIR%' -DestinationPath '%CD%\dist.zip' -Force"
if errorlevel 1 (
  echo [BUILD] Canh bao: khong cap nhat duoc dist.zip - kiem tra PowerShell.
) else (
  echo [BUILD]   + dist.zip
)

echo [BUILD] Dong bo staging output sang dist\%NAME% (best effort)...
if exist "%FINAL_DIST_DIR%" (
  call :clean_dir "%FINAL_DIST_DIR%" "final dist output folder"
)
if not exist "dist" mkdir dist
robocopy "%BUILD_DIST_DIR%" "%FINAL_DIST_DIR%" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS >nul
if errorlevel 8 (
  echo [BUILD] Canh bao: khong dong bo duoc staging output sang dist\%NAME%. Ban release van nam o %BUILD_DIST_DIR%
) else (
  echo [BUILD]   + dist\%NAME%
)

echo.
echo [BUILD] Thanh cong.
echo [BUILD] Version: %VERSION%
echo [BUILD] Chay thu: %BUILD_DIST_DIR%\%NAME%.exe
echo [BUILD] Giao khach: file release\EcoHub-portable.zip
echo [BUILD] Staging output: %BUILD_DIST_DIR%
echo [BUILD] Release da co san file .env canh EcoHub.exe.
echo [BUILD] Du lieu portable: %BUILD_DIST_DIR%\data (canh EcoHub.exe)
exit /b 0

:err
echo.
echo [BUILD] THAT BAI - xem loi phia tren.
exit /b 1

:clean_dir
set "TARGET=%~1"
set "LABEL=%~2"
if not exist "%TARGET%" (
  echo [BUILD] No previous %LABEL% to clean
  goto :eof
)
attrib -R "%TARGET%" /S /D >nul 2>&1
takeown /F "%TARGET%" /R /D Y >nul 2>&1
icacls "%TARGET%" /grant "%USERNAME%:F" /T /C >nul 2>&1
rmdir /S /Q "%TARGET%" >nul 2>&1
if exist "%TARGET%" (
  echo [BUILD] Canh bao: khong xoa het duoc %LABEL%: %TARGET%
) else (
  echo [BUILD] Cleaned previous %LABEL% with proper permissions
)
goto :eof
