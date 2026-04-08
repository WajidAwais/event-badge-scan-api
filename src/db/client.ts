import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/** Opens (creating if needed) the SQLite file at `filePath`; ":memory:" is accepted for tests. */
export function openDatabase(filePath: string): Database.Database {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scans (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      badge_id    TEXT    NOT NULL,
      booth_name  TEXT    NOT NULL,
      scan_date   TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(badge_id, scan_date)
    );

    CREATE INDEX IF NOT EXISTS idx_scans_badge_id  ON scans(badge_id);
    CREATE INDEX IF NOT EXISTS idx_scans_scan_date ON scans(scan_date);

    CREATE TABLE IF NOT EXISTS player_scan_counts (
      badge_id       TEXT PRIMARY KEY,
      scan_count     INTEGER NOT NULL DEFAULT 0,
      last_scan_date TEXT,
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS checkpoints (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
