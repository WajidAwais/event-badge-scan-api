import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "./client.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("openDatabase", () => {
  it("creates the schema on an in-memory database", () => {
    const db = openDatabase(":memory:");
    const tables = db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(["checkpoints", "player_scan_counts", "scans"]));
    db.close();
  });

  it("creates a missing parent directory for a file path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "booth-scan-"));
    tempDirs.push(dir);
    const file = path.join(dir, "nested", "scans.db");
    const db = openDatabase(file);
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    db.close();
    expect(fs.existsSync(file)).toBe(true);
  });
});
