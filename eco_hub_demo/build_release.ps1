# EcoHub - build Windows release (PyInstaller + zip)
# Chay: powershell -ExecutionPolicy Bypass -File .\build_release.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$Name = "EcoHub"
$BuildDistRoot = Join-Path $PSScriptRoot "dist_build"
$BuildDistDir = Join-Path $BuildDistRoot $Name
$FinalDistDir = Join-Path $PSScriptRoot "dist\$Name"
$VersionFile = Join-Path $PSScriptRoot "VERSION"
$Version = if (Test-Path $VersionFile) { (Get-Content $VersionFile -Raw).Trim() } else { "0.0.0" }
$DefaultReleaseDownloadUrl = "https://github.com/j4ngler/EcoHub/releases/latest/download/EcoHub-portable.zip"
$DefaultUpdateManifestUrl = "https://raw.githubusercontent.com/j4ngler/EcoHub/main/eco_hub_demo/release/latest.json"
$ReleaseDownloadUrl = $env:ECOHUB_RELEASE_DOWNLOAD_URL
if ($ReleaseDownloadUrl) { $ReleaseDownloadUrl = $ReleaseDownloadUrl.Trim() }
$ReleaseNotes = $env:ECOHUB_RELEASE_NOTES
if ($ReleaseNotes) { $ReleaseNotes = $ReleaseNotes.Trim() }

Write-Host "============================================"
Write-Host " EcoHub - build Windows exe (PyInstaller)"
Write-Host "============================================"
Write-Host "Thu muc: $(Get-Location)"
Write-Host ""

function Remove-BuildDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    if (-not (Test-Path $Path)) {
        Write-Host "[BUILD] No previous $Label to clean"
        return
    }

    attrib -R $Path /S /D *> $null
    takeown /F $Path /R /D Y *> $null
    icacls $Path /grant "${env:USERNAME}:F" /T /C *> $null
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue

    if (Test-Path $Path) {
        Write-Host "[BUILD] Canh bao: khong xoa het duoc $Label`: $Path"
    } else {
        Write-Host "[BUILD] Cleaned previous $Label with proper permissions"
    }
}

Remove-BuildDirectory -Path "build" -Label "build folder"
Remove-BuildDirectory -Path $BuildDistDir -Label "staging dist output folder"
Write-Host ""

$venvActivate = Join-Path $PSScriptRoot ".venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) {
    & $venvActivate
    Write-Host "[BUILD] Da kich hoat .venv"
} else {
    Write-Host "[BUILD] Canh bao: Chua co .venv - dung Python hien tai"
}

python -m pip install -U pip
if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed" }

python -m pip install -r requirements.txt pyinstaller
if ($LASTEXITCODE -ne 0) { throw "pip install requirements failed" }

$pyiArgs = @(
    "--clean", "--noconfirm",
    "--distpath", $BuildDistRoot,
    "--name", $Name,
    "--onedir",
    "--windowed",
    "--icon", "EcoHub.ico",
    "--collect-all", "flask",
    "--collect-all", "werkzeug",
    "--collect-all", "cv2",
    "--collect-all", "numpy",
    "--collect-all", "boto3",
    "--collect-all", "cryptography",
    "--hidden-import", "zxingcpp",
    "--hidden-import", "botocore",
    "--add-data", "templates;templates",
    "--add-data", "static;static",
    "--add-data", "config.json;.",
    "--add-data", "VERSION;."
)

if (Test-Path "config.key") {
    Write-Host "[BUILD] Them config.key vao bundle."
    $pyiArgs += "--add-data", "config.key;."
} else {
    Write-Host "[BUILD] Khong co config.key - bo qua."
}

$pyiArgs += "app.py"

python -m PyInstaller @pyiArgs
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed" }

$distDir = $BuildDistDir
if (-not (Test-Path $distDir)) {
    throw "Khong tim thay $distDir sau khi build"
}

Write-Host ""
Write-Host "[BUILD] Dong goi kem tai lieu giao khach..."

if ((Test-Path ".env") -or (Test-Path ".env.example")) {
    $targetEnv = Join-Path $distDir ".env"
    if (Test-Path ".env") {
        Copy-Item ".env" $targetEnv -Force
        Write-Host "[BUILD]   + .env"
    } else {
        Copy-Item ".env.example" $targetEnv -Force
        Write-Host "[BUILD]   + .env (copied from .env.example)"
    }
    $envContent = Get-Content -LiteralPath $targetEnv -Raw
    $envLine = "ECOHUB_UPDATE_MANIFEST_URL=$DefaultUpdateManifestUrl"
    if ($envContent -match '(?m)^ECOHUB_UPDATE_MANIFEST_URL=') {
        $envContent = [regex]::Replace($envContent, '(?m)^ECOHUB_UPDATE_MANIFEST_URL=.*$', $envLine)
    } elseif ($envContent -match '(?m)^#\s*ECOHUB_UPDATE_MANIFEST_URL=.*$') {
        $envContent = [regex]::Replace($envContent, '(?m)^#\s*ECOHUB_UPDATE_MANIFEST_URL=.*$', $envLine)
    } else {
        if ($envContent.Length -gt 0 -and -not $envContent.EndsWith([Environment]::NewLine)) {
            $envContent += [Environment]::NewLine
        }
        $envContent += $envLine + [Environment]::NewLine
    }
    Set-Content -LiteralPath $targetEnv -Value $envContent -Encoding UTF8
    Write-Host "[BUILD]   + ECOHUB_UPDATE_MANIFEST_URL=$DefaultUpdateManifestUrl"
}
if (Test-Path "GIAO_KHACH_HANG.txt") {
    Copy-Item "GIAO_KHACH_HANG.txt" (Join-Path $distDir "GIAO_KHACH_HANG.txt") -Force
    Write-Host "[BUILD]   + GIAO_KHACH_HANG.txt"
}
if (Test-Path "updater.ps1") {
    Copy-Item "updater.ps1" (Join-Path $distDir "updater.ps1") -Force
    Write-Host "[BUILD]   + updater.ps1"
}

$videosDir = Join-Path $distDir "data\videos"
New-Item -ItemType Directory -Path $videosDir -Force | Out-Null
"Kho video portable - EcoHub ghi file vao day." | Set-Content (Join-Path $videosDir "README.txt") -Encoding UTF8
Write-Host "[BUILD]   + data\videos (portable)"

$releaseDir = Join-Path $PSScriptRoot "release"
if (-not (Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir | Out-Null
}

$portableZip = Join-Path $releaseDir "EcoHub-portable.zip"
$distZip = Join-Path $PSScriptRoot "dist.zip"

Write-Host "[BUILD] Tao file zip (release\EcoHub-portable.zip)..."
Compress-Archive -LiteralPath $distDir -DestinationPath $portableZip -Force
Write-Host "[BUILD]   + release\EcoHub-portable.zip"

$manifest = [ordered]@{
    version = $Version
    url = $(if ($ReleaseDownloadUrl) { $ReleaseDownloadUrl } else { $DefaultReleaseDownloadUrl })
    notes = $(if ($ReleaseNotes) { $ReleaseNotes } else { "Portable release $Version" })
    published_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
}
$manifestPath = Join-Path $releaseDir "latest.json"
$manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host "[BUILD]   + release\latest.json"

Write-Host "[BUILD] Cap nhat file dist.zip..."
Compress-Archive -LiteralPath $distDir -DestinationPath $distZip -Force
Write-Host "[BUILD]   + dist.zip"

Write-Host "[BUILD] Dong bo staging output sang dist\$Name (best effort)..."
if (Test-Path $FinalDistDir) {
    Remove-BuildDirectory -Path $FinalDistDir -Label "final dist output folder"
}
if (-not (Test-Path (Join-Path $PSScriptRoot "dist"))) {
    New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot "dist") | Out-Null
}
& (Join-Path $env:SystemRoot "System32\robocopy.exe") $distDir $FinalDistDir /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS | Out-Null
if ($LASTEXITCODE -gt 7) {
    Write-Host "[BUILD] Canh bao: khong dong bo duoc staging output sang dist\$Name. Ban release van nam o $distDir"
} else {
    Write-Host "[BUILD]   + dist\$Name"
}

Write-Host ""
Write-Host "[BUILD] Thanh cong."
Write-Host "[BUILD] Version: $Version"
Write-Host "[BUILD] Chay thu: $distDir\$Name.exe"
Write-Host "[BUILD] Staging output: $distDir"
Write-Host "[BUILD] Du lieu portable: $distDir\data (canh EcoHub.exe)"
