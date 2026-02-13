# Convert HTML to PDF using Chrome Headless
# Requires Google Chrome or Microsoft Edge

param(
    [string]$HtmlDir = "html_docs",
    [string]$PdfDir = "pdf_docs"
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  HTML TO PDF CONVERTER (Chrome Headless)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Create PDF output directory
if (-not (Test-Path $PdfDir)) {
    New-Item -ItemType Directory -Path $PdfDir | Out-Null
    Write-Host "Created directory: $PdfDir" -ForegroundColor Green
}

# Find Chrome executable
$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

$chromeExe = $null
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $chromeExe = $path
        break
    }
}

if (-not $chromeExe) {
    Write-Host "ERROR: Chrome or Edge not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Google Chrome or use manual method:" -ForegroundColor Yellow
    Write-Host "  1. Open HTML file in browser" -ForegroundColor Yellow
    Write-Host "  2. Press Ctrl+P" -ForegroundColor Yellow
    Write-Host "  3. Choose 'Save as PDF'" -ForegroundColor Yellow
    Write-Host ""
    pause
    exit 1
}

Write-Host "Using: $chromeExe" -ForegroundColor Green
Write-Host ""

# Get all HTML files
$htmlFiles = Get-ChildItem -Path $HtmlDir -Filter "*.html"

if ($htmlFiles.Count -eq 0) {
    Write-Host "No HTML files found in $HtmlDir" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "Found $($htmlFiles.Count) HTML files to convert:" -ForegroundColor Cyan
foreach ($file in $htmlFiles) {
    Write-Host "  - $($file.Name)" -ForegroundColor Gray
}
Write-Host ""

# Convert each HTML to PDF
$successCount = 0
$currentDir = Get-Location

foreach ($file in $htmlFiles) {
    $htmlPath = Join-Path -Path $currentDir -ChildPath (Join-Path -Path $HtmlDir -ChildPath $file.Name)
    $pdfName = $file.BaseName + ".pdf"
    $pdfPath = Join-Path -Path $currentDir -ChildPath (Join-Path -Path $PdfDir -ChildPath $pdfName)
    
    Write-Host "Converting: $($file.Name) → $pdfName" -ForegroundColor Yellow
    
    try {
        # Run Chrome in headless mode to generate PDF
        $arguments = @(
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--print-to-pdf=`"$pdfPath`"",
            "`"$htmlPath`""
        )
        
        $process = Start-Process -FilePath $chromeExe -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
        
        if ($process.ExitCode -eq 0 -and (Test-Path $pdfPath)) {
            $fileSize = [math]::Round((Get-Item $pdfPath).Length / 1MB, 2)
            Write-Host "  OK - $pdfName ($fileSize MB)" -ForegroundColor Green
            $successCount++
        } else {
            Write-Host "  FAILED - $($file.Name)" -ForegroundColor Red
        }
    } catch {
        Write-Host "  ERROR - $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  CONVERSION COMPLETE" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Success: $successCount / $($htmlFiles.Count) files" -ForegroundColor Green
Write-Host "  Output:  $PdfDir\" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Open PDF folder
$openFolder = Read-Host "Open PDF folder? (y/n)"
if ($openFolder -eq "y") {
    Start-Process explorer.exe -ArgumentList (Join-Path $currentDir $PdfDir)
}
