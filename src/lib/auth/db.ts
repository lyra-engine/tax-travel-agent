import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

/**
 * better-sqlite3 is a native module and must not be loaded unless auth is
 * actually used. On Vercel (FIDELIS_AUTH=0) we never reach this code path,
 * which keeps the serverless bundle lean and free of native-module errors.
 */
const require = createRequire(import.meta.url);

type DatabaseType = import("better-sqlite3").Database;
type DatabaseCtor = new (path: string) => DatabaseType;

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "fidelis.sqlite");

let db: DatabaseType | null = null;

export function getDb(): DatabaseType {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const Database = require("better-sqlite3") as DatabaseCtor;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(d: DatabaseType) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      orgId TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','member')),
      createdAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_org ON users(orgId);

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      createdAt INTEGER NOT NULL,
      expiresAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);

    CREATE TABLE IF NOT EXISTS invites (
      token TEXT PRIMARY KEY,
      orgId TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      createdAt INTEGER NOT NULL,
      expiresAt INTEGER NOT NULL,
      consumedAt INTEGER
    );
  `);
}
