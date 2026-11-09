/**
 * Write a consistent single-file copy of the live database (safe while the app is running).
 * Usage: pnpm db:snapshot [target]   (default: data/finance-push.db)
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const source = process.env.DATABASE_FILE ?? path.join(root, "data", "finance.db");
const target = path.resolve(process.argv[2] ?? path.join(root, "data", "finance-push.db"));
if (!fs.existsSync(source)) throw new Error(`DB nicht gefunden: ${source}`);
fs.rmSync(target, { force: true });

const db = new Database(source, { readonly: true });
db.backup(target)
  .then(() => console.log(`Snapshot geschrieben: ${target}`))
  .finally(() => db.close());
