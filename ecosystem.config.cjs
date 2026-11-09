// pm2-Konfiguration für den Raspberry Pi (wird von scripts/pi-install.sh verwendet)
const path = require("path");

// Port 3000 ist auf dem Pi bereits belegt -> Standard 3001, überschreibbar mit FINMAN_PORT
const PORT = process.env.FINMAN_PORT || "3001";
// Node-Binary für finman (z.B. Node 22 aus nvm), unabhängig vom Node anderer pm2-Apps
const NODE = process.env.FINMAN_NODE || "node";

// Zugangsdaten für die Basic-Auth-Middleware (src/middleware.ts). Ohne FINMAN_PASSWORD sperrt die App alles.
// Beim ersten Start setzen:  FINMAN_PASSWORD=... pm2 start ecosystem.config.cjs
// Alternativ in data/.finman.env (KEY=VALUE pro Zeile, chmod 600) – diese Datei überlebt Deployments.
const fs = require("fs");
const fileEnv = {};
try {
  for (const line of fs.readFileSync(path.join(__dirname, "data", ".finman.env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) fileEnv[m[1]] = m[2];
  }
} catch {}
const PASSWORD = process.env.FINMAN_PASSWORD || fileEnv.FINMAN_PASSWORD || "";
const USER = process.env.FINMAN_USER || fileEnv.FINMAN_USER || "finman";
// Standard: im LAN erreichbar (mit Passwort). Nur lokal: FINMAN_HOST=127.0.0.1 (z. B. hinter Reverse-Proxy/Tailscale)
const HOST = process.env.FINMAN_HOST || fileEnv.FINMAN_HOST || "0.0.0.0";

module.exports = {
  apps: [
    {
      name: "finman",
      cwd: __dirname,
      script: path.join(__dirname, "node_modules", "next", "dist", "bin", "next"),
      args: `start -p ${PORT} -H ${HOST}`,
      interpreter: NODE,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        PORT,
        NEXT_TELEMETRY_DISABLED: "1",
        FINMAN_PASSWORD: PASSWORD,
        FINMAN_USER: USER,
        DATABASE_FILE: path.join(__dirname, "data", "finance.db"),
      },
    },
  ],
};
