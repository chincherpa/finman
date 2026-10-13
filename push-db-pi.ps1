# Kopiert die lokale DB (data/finance.db) auf den Pi und überschreibt dort die vorhandene.
# Aufruf (im Projektordner):
#   .\push-db-pi.ps1
#   .\push-db-pi.ps1 -Target pi@192.168.1.50 -AppDir ~/finman
param(
    [string]$Target = "pi@pi.local",
    [string]$AppDir = "~/finman",
    [string]$App = "finman"
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$db = Join-Path $PSScriptRoot "data\finance.db"
if (-not (Test-Path $db)) { throw "DB nicht gefunden: $db" }

$running = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($running) { Write-Warning "Auf Port 3000 läuft lokal etwas (pnpm dev?). Für eine konsistente DB-Kopie vorher beenden." }

# finance.db plus evtl. -wal/-shm (ohne .bak)
$files = Get-ChildItem (Join-Path $PSScriptRoot "data") -Filter "finance.db*" |
    Where-Object { $_.Name -notmatch "\.bak" } | ForEach-Object { $_.FullName }

Write-Host "==> Kopiere nach ${Target}:/tmp/" -ForegroundColor Cyan
scp @files "${Target}:/tmp/"
if ($LASTEXITCODE) { throw "scp fehlgeschlagen" }

Write-Host "==> Tausche DB auf dem Pi (Backup der alten als .bak)" -ForegroundColor Cyan
$remote = @"
set -e
D=$AppDir/data
mkdir -p "`$D"
pm2 stop $App || true
[ -f "`$D/finance.db" ] && cp "`$D/finance.db" "`$D/finance.db.bak-`$(date +%Y%m%d-%H%M%S)"
rm -f "`$D"/finance.db "`$D"/finance.db-wal "`$D"/finance.db-shm
mv /tmp/finance.db* "`$D"/
pm2 start $App
"@
ssh -t $Target ($remote -replace "`r", "")
if ($LASTEXITCODE) { throw "Austausch auf dem Pi fehlgeschlagen" }

Write-Host "==> Fertig" -ForegroundColor Green
