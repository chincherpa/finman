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

# Konsistente Einzeldatei-Kopie (auch bei laufendem pnpm dev), statt finance.db + -wal + -shm zu kopieren
$snap = Join-Path $PSScriptRoot "data\finance-push.db"
Write-Host "==> Erzeuge konsistenten Snapshot" -ForegroundColor Cyan
pnpm db:snapshot $snap
if ($LASTEXITCODE -or -not (Test-Path $snap)) { throw "Snapshot fehlgeschlagen" }

Write-Host "==> Kopiere nach ${Target}:/tmp/finman-push/" -ForegroundColor Cyan
ssh $Target "rm -rf /tmp/finman-push && mkdir -p /tmp/finman-push"
if ($LASTEXITCODE) { throw "ssh fehlgeschlagen" }
scp $snap "${Target}:/tmp/finman-push/finance.db"
if ($LASTEXITCODE) { throw "scp fehlgeschlagen" }
Remove-Item $snap -Force

Write-Host "==> Tausche DB auf dem Pi (Backup der alten als .bak)" -ForegroundColor Cyan
$remote = @"
set -e
D=$AppDir/data
mkdir -p "`$D"
pm2 stop $App || true
[ -f "`$D/finance.db" ] && cp "`$D/finance.db" "`$D/finance.db.bak-`$(date +%Y%m%d-%H%M%S)"
rm -f "`$D"/finance.db "`$D"/finance.db-wal "`$D"/finance.db-shm
mv /tmp/finman-push/finance.db "`$D"/finance.db
rmdir /tmp/finman-push
pm2 start $App
"@
ssh -t $Target ($remote -replace "`r", "")
if ($LASTEXITCODE) { throw "Austausch auf dem Pi fehlgeschlagen" }

Write-Host "==> Fertig" -ForegroundColor Green
