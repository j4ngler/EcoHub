@echo off
chcp 65001 >nul
echo ========================================
echo   BUILD INSTALLER FOR ECOHUB QR SCANNER
echo ========================================
echo.

:: Check if Inno Setup is installed
set "INNO_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist "%INNO_PATH%" (
    echo [ERROR] Inno Setup not found!
    echo.
    echo Please download and install Inno Setup:
    echo https://jrsoftware.org/isdl.php
    echo.
    pause
    exit /b 1
)

:: Check if EXE exists
if not exist "dist\EcoHub_QR_Scanner\EcoHub_QR_Scanner.exe" (
    echo [ERROR] EXE not found!
    echo Please run build_exe.bat first to build the EXE.
    echo.
    pause
    exit /b 1
)

:: Build installer with Inno Setup
echo [INFO] Building installer with Inno Setup...
"%INNO_PATH%" setup.iss

echo.
if exist "installer_output\EcoHub_QR_Scanner_Setup_v1.0.0.exe" (
    echo ========================================
    echo   INSTALLER BUILD COMPLETE!
    echo ========================================
    echo.
    echo Installer file: installer_output\EcoHub_QR_Scanner_Setup_v1.0.0.exe
    echo.
    echo You can now distribute this installer to users!
    echo.
) else (
    echo [ERROR] Installer build failed!
)

pause
