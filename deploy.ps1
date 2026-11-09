# Deployt nur diese App (finman) auf den Pi (ruft ..\deploy-pi-all.ps1 -Only finman auf).
# Aufruf (in diesem Ordner):  .\deploy.ps1 [-Target pi@192.168.1.50] [-Force]
# Ohne Quelländerungen wird übersprungen; -Force erzwingt Build und Deploy.
param(
    [string]$Target = "pi@pi.local",
    [switch]$Force
)
$all = Join-Path $PSScriptRoot "..\deploy-pi-all.ps1"
if (-not (Test-Path $all)) {
    throw "deploy-pi-all.ps1 fehlt (erwartet neben dem Projektordner: $all). Alternativ .\deploy-pi.ps1 verwenden."
}
& $all -Only finman @PSBoundParameters
exit $LASTEXITCODE
