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
set VERSION=0.0.0
set DEFAULT_RELEASE_DOWNLOAD_URL=https://github.com/j4ngler/EcoHub/releases/latest/download/EcoHub-portable.zip
set DEFAULT_UPDATE_MANIFEST_URL=https://raw.githubusercontent.com/j4ngler/EcoHub/main/eco_hub_demo/release/latest.json
if exist "VERSION" (
  set /p VERSION=<VERSION
)

echo ============================================
echo  EcoHub - build Windows exe (PyInstaller)
echo ============================================
rem Ensure we can delete the build folder by taking ownership and granting full rights
if exist "build" (
    takeown /F "build" /R /D Y >nul 2>&1
    icacls "build" /grant "%USERNAME%:F" /T /C >nul 2>&1
    rmdir /S /Q "build"
    echo [BUILD] Cleaned previous build folder with proper permissions
) else (
    echo [BUILD] No previous build folder to clean
)
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

set NAME=EcoHub

if exist "config.key" (
  echo [BUILD] Them config.key vao bundle.
  python -m PyInstaller --noconfirm --name %NAME% --onedir --windowed --icon "EcoHub.ico" --collect-all flask --collect-all werkzeug --collect-all cv2 --collect-all numpy --collect-all boto3 --collect-all cryptography --hidden-import zxingcpp --hidden-import botocore --add-data "templates;templates" --add-data "static;static" --add-data "config.json;." --add-data "config.key;." --add-data "VERSION;." app.py
) else (
  echo [BUILD] Khong co config.key - bo qua; app van chay, tao key luc can.
  python -m PyInstaller --clean --noconfirm --name %NAME% --onedir --windowed --icon "EcoHub.ico" --collect-all flask --collect-all werkzeug --collect-all cv2 --collect-all numpy --collect-all boto3 --collect-all cryptography --hidden-import zxingcpp --hidden-import botocore --add-data "templates;templates" --add-data "static;static" --add-data "config.json;." --add-data "VERSION;." app.py
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
if exist "dist\%NAME%" (
  if exist ".env" (
    copy /Y ".env" "dist\%NAME%\.env" >nul
    echo [BUILD]   + .env
  ) else (
    if exist ".env.example" (
      copy /Y ".env.example" "dist\%NAME%\.env" >nul
      echo [BUILD]   + .env (copied from .env.example)
    )
  )
  if exist "dist\%NAME%\.env" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$path = '%CD%\dist\%NAME%\.env'; $line = 'ECOHUB_UPDATE_MANIFEST_URL=%DEFAULT_UPDATE_MANIFEST_URL%'; if (-not (Test-Path -LiteralPath $path)) { exit 0 }; $content = Get-Content -LiteralPath $path -Raw; if ($content -match '(?m)^ECOHUB_UPDATE_MANIFEST_URL=') { $content = [regex]::Replace($content, '(?m)^ECOHUB_UPDATE_MANIFEST_URL=.*$', $line) } elseif ($content -match '(?m)^#\s*ECOHUB_UPDATE_MANIFEST_URL=.*$') { $content = [regex]::Replace($content, '(?m)^#\s*ECOHUB_UPDATE_MANIFEST_URL=.*$', $line) } else { if ($content.Length -gt 0 -and -not $content.EndsWith([Environment]::NewLine)) { $content += [Environment]::NewLine }; $content += $line + [Environment]::NewLine }; Set-Content -LiteralPath $path -Value $content -Encoding UTF8"
    echo [BUILD]   + ECOHUB_UPDATE_MANIFEST_URL=%DEFAULT_UPDATE_MANIFEST_URL%
  )
  if exist "GIAO_KHACH_HANG.txt" (
    copy /Y "GIAO_KHACH_HANG.txt" "dist\%NAME%\GIAO_KHACH_HANG.txt" >nul
    echo [BUILD]   + GIAO_KHACH_HANG.txt
  )
  if exist "updater.ps1" (
    copy /Y "updater.ps1" "dist\%NAME%\updater.ps1" >nul
    echo [BUILD]   + updater.ps1
  )
  if not exist "dist\%NAME%\data\videos" mkdir "dist\%NAME%\data\videos" 2>nul
  if exist "dist\%NAME%\data\videos" (
    echo Kho video portable - EcoHub ghi file vao day.> "dist\%NAME%\data\videos\README.txt"
    echo [BUILD]   + data\videos (portable)
  )
)

if not exist "release" mkdir release
echo [BUILD] Tao file zip (release\EcoHub-portable.zip)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -LiteralPath '%CD%\dist\%NAME%' -DestinationPath '%CD%\release\EcoHub-portable.zip' -Force"
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -LiteralPath '%CD%\dist\%NAME%' -DestinationPath '%CD%\dist.zip' -Force"
if errorlevel 1 (
  echo [BUILD] Canh bao: khong cap nhat duoc dist.zip - kiem tra PowerShell.
) else (
  echo [BUILD]   + dist.zip
)

echo.
echo [BUILD] Thanh cong.
echo [BUILD] Version: %VERSION%
echo [BUILD] Chay thu: dist\%NAME%\%NAME%.exe
echo [BUILD] Giao khach: ca thu muc dist\%NAME% HOAC file release\EcoHub-portable.zip
echo [BUILD] Release da co san file .env canh EcoHub.exe.
echo [BUILD] Du lieu portable: dist\%NAME%\data (canh EcoHub.exe)
exit /b 0

:err
echo.
echo [BUILD] THAT BAI - xem loi phia tren.
exit /b 1
