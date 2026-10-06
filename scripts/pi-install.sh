#!/usr/bin/env bash
# Läuft auf dem Raspberry Pi: entpackt, installiert (pnpm), baut und startet finman in pm2.
# Idempotent: bereits Vorhandenes wird erkannt, unveränderter Code wird nicht neu gebaut.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/finman}"
APP_DIR="${APP_DIR/#\~/$HOME}"
SRC_TGZ="${1:-/tmp/finman-src.tgz}"
DATA_TGZ="${2:-/tmp/finman-data.tgz}"
BUILD_TGZ="${3:-/tmp/finman-build.tgz}"   # vorgebautes .next (optional)
export FINMAN_PORT="${FINMAN_PORT:-3001}"
NODE_MIN=22
STATE_DIR="$APP_DIR/.deploy-state"

cleanup_on_exit() {
  rm -rf "$APP_DIR/.next.new" 2>/dev/null || true
  rm -f "$SRC_TGZ" "$DATA_TGZ" "$BUILD_TGZ" 2>/dev/null || true
}
trap cleanup_on_exit EXIT

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
skip() { printf '\033[0;32m    ✓ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mFEHLER: %s\033[0m\n' "$*" >&2; exit 1; }
node_major() { "$1" -p 'process.versions.node.split(".")[0]'; }

# --- Umgebung wie in einer Login-Shell (nvm, pnpm, ~/.local/bin) -------------
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
HAS_NVM=0
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  set +u; . "$NVM_DIR/nvm.sh"; set -u
  HAS_NVM=1
fi
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
mkdir -p "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PNPM_HOME:$PATH"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export NEXT_TELEMETRY_DISABLED=1
export npm_config_update_notifier=false

# --- Speicherplatz ----------------------------------------------------------------
free_mb() { df -Pm "$1" | awk 'NR==2 {print $4}'; }
show_space_hogs() {
  echo "    Größte Verbraucher:" >&2
  du -sh "$HOME"/finman/{node_modules,.next,.next.new} "$HOME"/.local/share/pnpm/store \
         "$HOME"/.cache "$HOME"/.npm "$HOME"/.pm2/logs /tmp 2>/dev/null | sort -h | tail -n 10 >&2 || true
  echo "    Aufräumen z.B.: pnpm store prune; pm2 flush; sudo apt-get clean; sudo journalctl --vacuum-size=50M" >&2
}
log "Speicherplatz"
mkdir -p "$APP_DIR"
FREE="$(free_mb "$APP_DIR")"
echo "    frei: ${FREE} MB"
if [ "$FREE" -lt 300 ]; then
  show_space_hogs
  die "Zu wenig Speicherplatz (${FREE} MB frei, mindestens 300 MB nötig)"
fi

# --- Node.js >= 22 (bestehendes Node anderer Apps wird NICHT verändert) -------
log "Node.js"
FINMAN_NODE=""
if command -v node >/dev/null 2>&1 && [ "$(node_major node)" -ge "$NODE_MIN" ]; then
  FINMAN_NODE="$(command -v node)"
  skip "vorhanden: $(node -v) ($FINMAN_NODE)"
elif [ "$HAS_NVM" -eq 1 ]; then
  # nvm vorhanden: Node 22 zusätzlich installieren, Default-Version bleibt unverändert
  if nvm ls "$NODE_MIN" >/dev/null 2>&1; then
    skip "Node $NODE_MIN bereits in nvm installiert"
  else
    echo "    installiere Node $NODE_MIN in nvm (Default bleibt $(nvm current))"
    nvm install "$NODE_MIN" --no-progress >/dev/null
  fi
  FINMAN_NODE="$(nvm which "$NODE_MIN")"
elif command -v node >/dev/null 2>&1; then
  die "System-Node $(node -v) ist älter als $NODE_MIN und wird evtl. von deiner anderen App genutzt.
       Ich ändere es nicht automatisch. Optionen:
         a) nvm installieren (curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash) und erneut deployen
         b) System-Node bewusst aktualisieren und erneut deployen"
else
  echo "    kein Node gefunden -> installiere Node $NODE_MIN (NodeSource)"
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg build-essential python3
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MIN}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
  FINMAN_NODE="$(command -v node)"
fi
# Für alles Weitere (pnpm, Build) dieses Node verwenden
export PATH="$(dirname "$FINMAN_NODE"):$PATH"
export FINMAN_NODE
echo "    finman nutzt: $("$FINMAN_NODE" -v) ($FINMAN_NODE)"

# --- pnpm (Version aus package.json "packageManager") --------------------------
log "pnpm"
PNPM_WANT="$(tar -xzOf "$SRC_TGZ" ./package.json | "$FINMAN_NODE" -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).packageManager.split("@")[1]')"
PNPM_WANT_MAJOR="${PNPM_WANT%%.*}"
pnpm_ok() { command -v pnpm >/dev/null 2>&1 && [ "$( (cd /tmp && pnpm -v 2>/dev/null) | cut -d. -f1)" -ge "$PNPM_WANT_MAJOR" ] 2>/dev/null; }
if pnpm_ok; then
  skip "vorhanden: $(cd /tmp && pnpm -v)"
else
  if command -v corepack >/dev/null 2>&1; then
    echo "    aktiviere pnpm@$PNPM_WANT über corepack (nach ~/.local/bin, ohne sudo)"
    corepack enable --install-directory "$HOME/.local/bin" pnpm
    corepack prepare "pnpm@$PNPM_WANT" --activate >/dev/null
  else
    echo "    installiere pnpm@$PNPM_WANT nach ~/.local (ohne sudo)"
    npm install -g --prefix "$HOME/.local" "pnpm@$PNPM_WANT"
  fi
  hash -r
  pnpm_ok || die "pnpm >= $PNPM_WANT_MAJOR konnte nicht bereitgestellt werden"
  skip "pnpm $(cd /tmp && pnpm -v)"
fi

# --- pm2 (vorhandenes pm2 der anderen App wird mitgenutzt) ---------------------
log "pm2"
if command -v pm2 >/dev/null 2>&1; then
  skip "vorhanden: $(command -v pm2) ($(pm2 -v 2>/dev/null | tail -1))"
else
  echo "    installiere pm2 (pnpm global)"
  (cd /tmp && pnpm add -g pm2)
  hash -r
fi

# --- Code entpacken -------------------------------------------------------------
log "Code nach $APP_DIR"
mkdir -p "$APP_DIR" "$STATE_DIR"
# alte Quellen entfernen; data/, node_modules/, .next/ und Deploy-Status bleiben erhalten
find "$APP_DIR" -mindepth 1 -maxdepth 1 \
  ! -name data ! -name node_modules ! -name .next ! -name .deploy-state -exec rm -rf {} +
tar -xzf "$SRC_TGZ" -C "$APP_DIR"
cd "$APP_DIR"

# --- Datenbank nur beim ersten Mal übernehmen ----------------------------------
mkdir -p data
if [ -f data/finance.db ]; then
  skip "Datenbank vorhanden – bleibt unverändert"
elif [ -f "$DATA_TGZ" ]; then
  echo "    übernehme lokale Datenbank (Erstinstallation)"
  tar -xzf "$DATA_TGZ" -C "$APP_DIR"
else
  echo "    keine Datenbank vorhanden – App legt beim Start eine leere an"
fi

# --- Hashes für Änderungserkennung --------------------------------------------
NODE_V="$("$FINMAN_NODE" -v)"
DEPS_HASH="$( { echo "$NODE_V prod"; cat package.json pnpm-lock.yaml pnpm-workspace.yaml 2>/dev/null || true; } | sha256sum | cut -d' ' -f1)"
SRC_HASH="$( { echo "$DEPS_HASH"
  find . \( -path ./node_modules -o -path ./.next -o -path ./data -o -path ./.deploy-state \) -prune \
    -o -type f -print0 | sort -z | xargs -0 sha256sum; } | sha256sum | cut -d' ' -f1)"
old() { cat "$STATE_DIR/$1" 2>/dev/null || true; }

# --- Install --------------------------------------------------------------------
log "Abhängigkeiten"
if [ -d node_modules ] && [ "$(old deps-hash)" = "$DEPS_HASH" ]; then
  skip "unverändert – pnpm install übersprungen"
else
  # nur Produktions-Abhängigkeiten: gebaut wird auf dem Windows-Rechner
  pnpm install --prod --frozen-lockfile || pnpm install --prod
  echo "$DEPS_HASH" > "$STATE_DIR/deps-hash"
  echo "    räume pnpm-Store auf"
  pnpm store prune >/dev/null 2>&1 || true
fi

# --- Build ----------------------------------------------------------------------
log "Build"
BUILT=0
if [ -f "$BUILD_TGZ" ]; then
  # Vorgebautes .next vom Windows-Rechner übernehmen
  NEW_ID="$(tar -xzOf "$BUILD_TGZ" ./BUILD_ID)"
  if [ -f .next/BUILD_ID ] && [ "$(cat .next/BUILD_ID)" = "$NEW_ID" ]; then
    skip "vorgebauter Stand $NEW_ID bereits aktiv"
  else
    echo "    übernehme vorgebautes .next ($NEW_ID)"
    rm -rf .next.new .next/cache
    NEED_MB=$(( $(gzip -l "$BUILD_TGZ" | awk 'NR==2 {print int($2/1048576)}') + 50 ))
    if [ "$(free_mb "$APP_DIR")" -lt "$NEED_MB" ]; then
      # nicht genug Platz für alt + neu nebeneinander -> altes .next zuerst entfernen
      echo "    wenig Platz – entferne altes .next vorab (kurze Ausfallzeit)"
      pm2 stop finman >/dev/null 2>&1 || true
      rm -rf .next
    fi
    [ "$(free_mb "$APP_DIR")" -lt "$NEED_MB" ] && { show_space_hogs; die "Zu wenig Platz für den Build (${NEED_MB} MB nötig)"; }
    mkdir .next.new
    tar -xzf "$BUILD_TGZ" -C .next.new
    rm -rf .next && mv .next.new .next
    BUILT=1
  fi
  echo "$SRC_HASH" > "$STATE_DIR/build-hash"
elif [ -f .next/BUILD_ID ] && [ "$(old build-hash)" = "$SRC_HASH" ]; then
  skip "Code unverändert – Build übersprungen"
else
  rm -f "$STATE_DIR/build-hash"
  mem_mb="$(awk '/MemTotal|SwapTotal/ {s+=$2} END {print int(s/1024)}' /proc/meminfo)"
  [ "$mem_mb" -lt 3000 ] && echo "    WARNUNG: nur ${mem_mb} MB RAM+Swap – next build kann vom OOM-Killer beendet werden"
  if ! NODE_OPTIONS="--max-old-space-size=1536" pnpm build; then
    die "Build auf dem Pi fehlgeschlagen (vermutlich zu wenig Speicher). Ohne -RemoteBuild deployen, dann wird lokal gebaut."
  fi
  echo "$SRC_HASH" > "$STATE_DIR/build-hash"
  BUILT=1
fi

# --- pm2 ------------------------------------------------------------------------
log "pm2-App finman (Port $FINMAN_PORT)"
pm2 list || true

status="$(pm2 jlist 2>/dev/null | "$FINMAN_NODE" -e '
  let s="";try{const a=JSON.parse(require("fs").readFileSync(0,"utf8")).find(p=>p.name==="finman");
  s=a?a.pm2_env.status:""}catch{}; process.stdout.write(s)')"
cfg_hash="$( { echo "$FINMAN_PORT $FINMAN_NODE"; cat ecosystem.config.cjs; } | sha256sum | cut -d' ' -f1)"

if [ "$status" = "online" ] && [ "$BUILT" -eq 0 ] && [ "$(old cfg-hash)" = "$cfg_hash" ]; then
  skip "läuft bereits mit aktuellem Stand – kein Neustart nötig"
else
  # Eigene Instanz kurz stoppen, dann prüfen, ob der Port von einer ANDEREN App belegt ist
  [ -n "$status" ] && pm2 stop finman >/dev/null 2>&1 || true
  sleep 1
  if ss -ltnH "( sport = :$FINMAN_PORT )" 2>/dev/null | grep -q .; then
    sudo ss -ltnp "( sport = :$FINMAN_PORT )" >&2 || true
    [ -n "$status" ] && pm2 start finman >/dev/null 2>&1 || true
    die "Port $FINMAN_PORT ist von einer anderen Anwendung belegt. Anderen Port wählen: .\\deploy-pi.ps1 -Port 3002"
  fi
  if [ -n "$status" ]; then
    # delete + start, damit geänderte Port-/Interpreter-Einstellungen sicher übernommen werden
    pm2 delete finman >/dev/null
  fi
  pm2 start ecosystem.config.cjs
  echo "$cfg_hash" > "$STATE_DIR/cfg-hash"
  pm2 save
fi

# --- Autostart ------------------------------------------------------------------
log "Autostart"
if systemctl list-unit-files 2>/dev/null | grep -q "^pm2-$USER.service"; then
  skip "systemd-Unit pm2-$USER vorhanden"
else
  sudo env PATH="$PATH" "$(command -v pm2)" startup systemd -u "$USER" --hp "$HOME"
  pm2 save
fi

rm -f "$SRC_TGZ" "$DATA_TGZ" "$BUILD_TGZ"

# --- Healthcheck ----------------------------------------------------------------
log "Healthcheck"
for _ in $(seq 1 20); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$FINMAN_PORT/" || true)"
  [ "$code" != "000" ] && break
  sleep 1
done
if [ "${code:-000}" = "000" ]; then
  pm2 logs finman --lines 30 --nostream || true
  die "finman antwortet nicht auf Port $FINMAN_PORT"
fi
skip "HTTP $code"
pm2 status finman
log "Fertig: http://$(hostname).local:$FINMAN_PORT  bzw. http://$(hostname -I | awk '{print $1}'):$FINMAN_PORT"
