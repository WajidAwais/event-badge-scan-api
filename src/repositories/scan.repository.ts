import type Database from "better-sqlite3";
import type { Scan } from "../types/domain.js";

export interface ScanRow {
  id: number;
  badge_id: string;
  booth_name: string;
  scan_date: string;
  created_at: string;
}

export interface ScanSearchParams {
  badgeId?: string;
  boothName?: string;
  scanDate?: string;
  limit?: number;
  offset?: number;
}

/** Escapes LIKE wildcards so user input such as "50%" or "a_b" matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function createScanRepository(db: Database.Database) {
  const insertStmt = db.prepare<[string, string, string]>(`
    INSERT OR IGNORE INTO scans (badge_id, booth_name, scan_date)
    VALUES (?, ?, ?)
  `);

  return {
    /**
     * Inserts a scan. Returns true if the row was new, false if it already existed.
     */
    insertScan(scan: Scan): boolean {
      const result = insertStmt.run(scan.badgeId, scan.boothName, scan.scanDate);
      return result.changes > 0;
    },


    /**
     * Flexible search: filter by badgeId, boothName (partial, case-insensitive),
     * or scanDate prefix (e.g. "2026-02-09"). Any combination of filters is supported.
     */
    searchScans(params: ScanSearchParams): { rows: ScanRow[]; total: number } {
      const { badgeId, boothName, scanDate, limit = 50, offset = 0 } = params;

      const conditions: string[] = [];
      const args: (string | number)[] = [];

      if (badgeId) {
        conditions.push("badge_id = ?");
        args.push(badgeId);
      }
      if (boothName) {
        conditions.push("booth_name LIKE ? ESCAPE '\\'");
        args.push(`%${escapeLike(boothName)}%`);
      }
      if (scanDate) {
        conditions.push("scan_date LIKE ? ESCAPE '\\'");
        args.push(`${escapeLike(scanDate)}%`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const total = (
        db.prepare<typeof args, { count: number }>(`SELECT COUNT(*) as count FROM scans ${where}`).get(...args) ?? { count: 0 }
      ).count;

      const rows = db
        .prepare<typeof args, ScanRow>(
          `SELECT * FROM scans ${where} ORDER BY scan_date ASC LIMIT ? OFFSET ?`,
        )
        .all(...args, limit, offset);

      return { rows, total };
    },
  };
}
