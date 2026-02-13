@echo off
chcp 65001 >nul
echo ========================================
echo   BUILD ECOHUB QR SCANNER TO EXE
echo ========================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found! Install Python first.
    pause
    exit /b 1
)

:: Install PyInstaller if not exists
echo [1/4] Checking PyInstaller...
pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo Installing PyInstaller...
    pip install pyinstaller
)

:: Install dependencies
echo [2/4] Installing dependencies...
pip install -r requirements.txt

:: Clean old build
echo [3/4] Cleaning old build...
if exist "build" rmdir /s /q build
if exist "dist" rmdir /s /q dist

:: Build with PyInstaller
echo [4/4] Building EXE with PyInstaller...
pyinstaller build.spec --clean

echo.
echo ========================================
echo   BUILD COMPLETE!
echo ========================================
echo.
echo EXE file: dist\EcoHub_QR_Scanner\EcoHub_QR_Scanner.exe
echo.
echo Next steps:
echo 1. Test: Run dist\EcoHub_QR_Scanner\EcoHub_QR_Scanner.exe
echo 2. Build installer: Run build_installer.bat
echo.
pause
