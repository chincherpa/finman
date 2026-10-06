import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // deploy-pi.ps1 baut nach .next-pi, damit ein laufendes `pnpm dev` (.next) unberührt bleibt
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
