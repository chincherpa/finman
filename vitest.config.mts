import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // the real package throws outside Next's server bundle
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // never touch data/finance.db; DST tests need a zone with DST
    env: { DATABASE_FILE: ":memory:", TZ: "Europe/Berlin" },
  },
});
