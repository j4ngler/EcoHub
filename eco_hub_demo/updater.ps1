param(
    [Parameter(Mandatory = $true)]
    [string]$ZipPath,

    [Parameter(Mandatory = $true)]
    [string]$AppDir,

    [Parameter(Mandatory = $true)]
    [string]$ExeName,

    [Parameter(Mandatory = $true)]
    [int]$WaitPid
)

$ErrorActionPreference = "Stop"

function Write-UpdateLog {
    param([string]$Message)
    $logDir = Join-Path $AppDir "data\updates"
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $logFile = Join-Path $logDir "updater.log"
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -LiteralPath $logFile -Value "[$timestamp] $Message"
}

try {
    Write-UpdateLog "Starting updater. ZipPath=$ZipPath AppDir=$AppDir ExeName=$ExeName WaitPid=$WaitPid"

    if (-not (Test-Path -LiteralPath $ZipPath)) {
        throw "Update package not found: $ZipPath"
    }
    if (-not (Test-Path -LiteralPath $AppDir)) {
        throw "AppDir not found: $AppDir"
    }

    try {
        Wait-Process -Id $WaitPid -Timeout 180 -ErrorAction Stop
        Write-UpdateLog "Waited for process $WaitPid to exit."
    } catch {
        Write-UpdateLog "Wait-Process finished or timed out for ${WaitPid}: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds 2

    $extractRoot = Join-Path $AppDir "_update_extract"
    if (Test-Path -LiteralPath $extractRoot) {
        Remove-Item -LiteralPath $extractRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $extractRoot -Force
    Write-UpdateLog "Expanded archive to $extractRoot"

    $packageDir = $extractRoot
    $dirs = Get-ChildItem -LiteralPath $extractRoot -Directory
    if ($dirs.Count -eq 1) {
        $packageDir = $dirs[0].FullName
    }

    $robocopyExe = Join-Path $env:SystemRoot "System32\robocopy.exe"
    & $robocopyExe $packageDir $AppDir /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NC /NS /XD data /XF .env | Out-Null
    $rc = $LASTEXITCODE
    if ($rc -gt 7) {
        throw "robocopy failed with exit code $rc"
    }
    Write-UpdateLog "Copied update payload into app dir."

    try {
        Remove-Item -LiteralPath $extractRoot -Recurse -Force
    } catch {
        Write-UpdateLog "Could not delete temp extract dir: $($_.Exception.Message)"
    }

    $exePath = Join-Path $AppDir $ExeName
    if (-not (Test-Path -LiteralPath $exePath)) {
        throw "Updated exe not found: $exePath"
    }

    Start-Process -FilePath $exePath -WorkingDirectory $AppDir -WindowStyle Hidden
    Write-UpdateLog "Restarted application: $exePath"
} catch {
    Write-UpdateLog "Updater failed: $($_.Exception.Message)"
    throw
}
