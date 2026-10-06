// pm2-Konfiguration für den Raspberry Pi (wird von scripts/pi-install.sh verwendet)
const path = require("path");

// Port 3000 ist auf dem Pi bereits belegt -> Standard 3001, überschreibbar mit FINMAN_PORT
const PORT = process.env.FINMAN_PORT || "3001";
// Node-Binary für finman (z.B. Node 22 aus nvm), unabhängig vom Node anderer pm2-Apps
const NODE = process.env.FINMAN_NODE || "node";

module.exports = {
  apps: [
    {
      name: "finman",
      cwd: __dirname,
      script: path.join(__dirname, "node_modules", "next", "dist", "bin", "next"),
      args: `start -p ${PORT} -H 0.0.0.0`,
      interpreter: NODE,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        PORT,
        NEXT_TELEMETRY_DISABLED: "1",
        DATABASE_FILE: path.join(__dirname, "data", "finance.db"),
      },
    },
  ],
};
