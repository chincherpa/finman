# Deployt finman auf den Raspberry Pi und startet es in pm2.
# Aufruf (im Projektordner):
#   .\deploy-pi.ps1                 # normales Update
#   .\deploy-pi.ps1 -Port 3002      # anderer Port
#   .\deploy-pi.ps1 -RemoteBuild   # auf dem Pi bauen statt lokal (braucht viel RAM/Swap)
#   .\deploy-pi.ps1 -WithDb         # lokale DB erneut mitschicken (wird auf dem Pi NUR genutzt, wenn dort keine existiert)
param(
    [string]$Target = "pi@pi.local",
    [string]$AppDir = "~/finman",
    [int]$Port = 3001,
    [switch]$WithDb,
    [switch]$RemoteBuild
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$stateFile = Join-Path $PSScriptRoot ".deploy-pi.state"
$stateKey  = "$Target|$AppDir"
$deployed  = (Test-Path $stateFile) -and ((Get-Content $stateFile -ErrorAction SilentlyContinue) -contains $stateKey)
$sendDb    = $WithDb -or -not $deployed

$src  = Join-Path $env:TEMP "finman-src.tgz"
$data = Join-Path $env:TEMP "finman-data.tgz"
$build = Join-Path $env:TEMP "finman-build.tgz"
Remove-Item $src, $data, $build -ErrorAction SilentlyContinue

Write-Host "==> Packe Quellen" -ForegroundColor Cyan
tar -czf $src --exclude=./node_modules --exclude=./.next --exclude=./.git --exclude=./documents `
    --exclude=./.next-pi --exclude=./data --exclude=*.tsbuildinfo --exclude=./deploy-pi.ps1 --exclude=./.deploy-pi.state .
if ($LASTEXITCODE) { throw "tar (Quellen) fehlgeschlagen" }

$files = @($src, "scripts/pi-install.sh")

if (-not $RemoteBuild) {
    # Der Pi hat zu wenig RAM für `next build` -> lokal bauen, nur das Ergebnis (.next) übertragen.
    # Build-Ausgabe ist plattformunabhängig; native Module (better-sqlite3, swc) installiert pnpm auf dem Pi.
    Write-Host "==> Baue lokal (pnpm build -> .next-pi)" -ForegroundColor Cyan
    $env:NEXT_DIST_DIR = ".next-pi"
    try { pnpm build } finally { Remove-Item Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue }
    if ($LASTEXITCODE) { throw "Lokaler Build fehlgeschlagen" }
    tar -czf $build -C .next-pi --exclude=./cache .
    if ($LASTEXITCODE) { throw "tar (Build) fehlgeschlagen" }
    $files += $build
}
if ($sendDb) {
    Write-Host "==> Packe Datenbank (Erstinstallation)" -ForegroundColor Cyan
    $running = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    if ($running) { Write-Warning "Auf Port 3000 läuft lokal etwas (pnpm dev?). Für eine konsistente DB-Kopie vorher beenden." }
    $dbFiles = Get-ChildItem data -Filter "finance.db*" | Where-Object { $_.Name -notmatch "\.bak" } |
        ForEach-Object { "data/$($_.Name)" }
    tar -czf $data @dbFiles
    if ($LASTEXITCODE) { throw "tar (Datenbank) fehlgeschlagen" }
    $files += $data
} else {
    Write-Host "==> Datenbank wird nicht mitgeschickt (bereits deployt, -WithDb erzwingt es)" -ForegroundColor DarkGray
}

Write-Host "==> Kopiere nach $Target" -ForegroundColor Cyan
scp @files "${Target}:/tmp/"
if ($LASTEXITCODE) { throw "scp fehlgeschlagen" }

Write-Host "==> Installiere auf dem Pi" -ForegroundColor Cyan
$buildArg = if ($RemoteBuild) { "none" } else { "/tmp/finman-build.tgz" }
ssh -t $Target "APP_DIR=$AppDir FINMAN_PORT=$Port bash /tmp/pi-install.sh /tmp/finman-src.tgz /tmp/finman-data.tgz $buildArg"
if ($LASTEXITCODE) { throw "Installation auf dem Pi fehlgeschlagen" }

if (-not $deployed) { Add-Content $stateFile $stateKey }
Remove-Item $src, $data, $build -ErrorAction SilentlyContinue
