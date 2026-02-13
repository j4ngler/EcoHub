@echo off
chcp 65001 > nul
echo ============================================================
echo   CONVERT MARKDOWN TO PDF
echo ============================================================
echo.

REM Check if Python packages are installed
echo [1/3] Checking dependencies...
pip show markdown >nul 2>&1
if errorlevel 1 (
    echo Installing markdown...
    pip install markdown
)

pip show weasyprint >nul 2>&1
if errorlevel 1 (
    echo Installing weasyprint...
    echo Note: This may take a few minutes...
    pip install weasyprint
)

echo.
echo [2/3] Converting files...
python convert_to_pdf.py

echo.
echo [3/3] Done!
echo.
echo PDF files are in: pdf_docs\
echo.
pause
