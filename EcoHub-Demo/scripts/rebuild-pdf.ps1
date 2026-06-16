$currentDir = Get-Location
$mdPath = Join-Path $currentDir.Path "PROJECT_SUMMARY.md"
$htmlPath = Join-Path $currentDir.Path "PROJECT_SUMMARY.html"
$pdfPath = Join-Path $currentDir.Path "PROJECT_SUMMARY.pdf"
$cssPath = Join-Path $currentDir.Path "scripts\pdf-style.css"
$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

Write-Host "Compiling Markdown to HTML..."
pandoc -s -c "$cssPath" "$mdPath" -o "$htmlPath"

if (Test-Path $htmlPath) {
    Write-Host "Converting HTML to PDF using MS Edge..."
    $htmlUri = "file:///" + $htmlPath.Replace('\', '/')
    
    # Start msedge.exe and wait for it to finish
    Start-Process $edgePath -ArgumentList "--headless", "--disable-gpu", "--no-sandbox", "--print-to-pdf-no-header", "--print-to-pdf=$pdfPath", $htmlUri -Wait
    
    # Wait another second to ensure file lock is released
    Start-Sleep -Seconds 1
    
    if (Test-Path $pdfPath) {
        Write-Host "Success: PDF successfully compiled at $pdfPath"
        # Cleanup temporary HTML
        Remove-Item $htmlPath -ErrorAction SilentlyContinue
    } else {
        Write-Error "Failed to generate PDF at $pdfPath"
    }
} else {
    Write-Error "Failed to generate temporary HTML at $htmlPath"
}
