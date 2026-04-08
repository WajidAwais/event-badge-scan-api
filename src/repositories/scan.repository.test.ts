import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "../db/client.js";
import { createScanRepository } from "./scan.repository.js";

describe("scan repository search", () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createScanRepository>;

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = createScanRepository(db);
    repo.insertScan({ badgeId: "demo-badge-001", boothName: "Stand_A", scanDate: "2026-02-04T10:00:00.000Z" });
    repo.insertScan({ badgeId: "demo-badge-002", boothName: "StandXA", scanDate: "2026-02-04T11:00:00.000Z" });
    repo.insertScan({ badgeId: "demo-badge-001", boothName: "100% Coffee", scanDate: "2026-02-05T09:00:00.000Z" });
  });

  it("reports whether an insert added a row", () => {
    expect(repo.insertScan({ badgeId: "demo-badge-001", boothName: "Stand_A", scanDate: "2026-02-04T10:00:00.000Z" })).toBe(false);
  });

  it("treats underscore and percent in boothName as literal characters", () => {
    expect(repo.searchScans({ boothName: "Stand_" }).rows.map((r) => r.booth_name)).toEqual(["Stand_A"]);
    expect(repo.searchScans({ boothName: "100%" }).total).toBe(1);
    expect(repo.searchScans({ boothName: "%" }).total).toBe(1);
  });

  it("matches boothName case-insensitively as a substring", () => {
    expect(repo.searchScans({ boothName: "coffee" }).total).toBe(1);
  });

  it("filters by date prefix and badge, with limit and offset", () => {
    expect(repo.searchScans({ scanDate: "2026-02-04" }).total).toBe(2);
    expect(repo.searchScans({ scanDate: "2026-02-0_" }).total).toBe(0);
    const page = repo.searchScans({ badgeId: "demo-badge-001", limit: 1, offset: 1 });
    expect(page.total).toBe(2);
    expect(page.rows.map((r) => r.booth_name)).toEqual(["100% Coffee"]);
  });
});
