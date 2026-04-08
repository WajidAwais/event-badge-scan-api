import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { openDatabase } from "./db/client.js";
import { createApp } from "./app.js";
import { createScanRepository } from "./repositories/scan.repository.js";
import { createPlayerRepository } from "./repositories/player.repository.js";

function seed(db: Database.Database): void {
  const scans = createScanRepository(db);
  const players = createPlayerRepository(db);
  const rows = [
    { badgeId: "demo-badge-001", boothName: "Hall A / Robotics", scanDate: "2026-02-04T10:00:00.000Z" },
    { badgeId: "demo-badge-001", boothName: "Hall B / Merch", scanDate: "2026-02-04T11:30:00.000Z" },
    { badgeId: "demo-badge-002", boothName: "Hall A / Robotics", scanDate: "2026-02-05T09:15:00.000Z" },
  ];
  for (const row of rows) {
    if (scans.insertScan(row)) players.incrementScanCount(row.badgeId, row.scanDate);
  }
}

describe("read API", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  it("answers 404 PLAYERS_EMPTY for top and bottom before any import", async () => {
    const app = createApp(db);
    for (const path of ["/players/top", "/players/bottom"]) {
      const res = await request(app).get(path).expect(404);
      expect(res.body.error.code).toBe("PLAYERS_EMPTY");
    }
    const list = await request(app).get("/players").expect(200);
    expect(list.body.data).toEqual({ players: [], total: 0 });
  });

  it("lists players by count and picks top and bottom", async () => {
    seed(db);
    const app = createApp(db);
    const list = await request(app).get("/players").expect(200);
    expect(list.body.data.players.map((p: { badgeId: string }) => p.badgeId)).toEqual(["demo-badge-001", "demo-badge-002"]);
    expect((await request(app).get("/players/top")).body.data.player.scanCount).toBe(2);
    expect((await request(app).get("/players/bottom")).body.data.player.badgeId).toBe("demo-badge-002");
  });

  it("returns one player's scans, or 404 for an unknown badge", async () => {
    seed(db);
    const app = createApp(db);
    const res = await request(app).get("/players/demo-badge-001").expect(200);
    expect(res.body.data).toMatchObject({ badgeId: "demo-badge-001", scanCount: 2, lastScanDate: "2026-02-04T11:30:00.000Z" });
    expect(res.body.data.scans).toEqual([
      { boothName: "Hall A / Robotics", scanDate: "2026-02-04T10:00:00.000Z" },
      { boothName: "Hall B / Merch", scanDate: "2026-02-04T11:30:00.000Z" },
    ]);
    const missing = await request(app).get("/players/nobody").expect(404);
    expect(missing.body.error).toMatchObject({ code: "PLAYER_NOT_FOUND", details: { badgeId: "nobody" } });
  });

  it("filters and pages /scans", async () => {
    seed(db);
    const app = createApp(db);
    const res = await request(app).get("/scans").query({ boothName: "robotics", limit: 1, offset: 1 }).expect(200);
    expect(res.body.data).toEqual({
      scans: [{ badgeId: "demo-badge-002", boothName: "Hall A / Robotics", scanDate: "2026-02-05T09:15:00.000Z" }],
      total: 2,
      limit: 1,
      offset: 1,
    });
    const byDay = await request(app).get("/scans?scanDate=2026-02-04").expect(200);
    expect(byDay.body.data.total).toBe(2);
  });

  it("rejects an out-of-range limit with 422", async () => {
    const res = await request(createApp(db)).get("/scans?limit=501").expect(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.fieldErrors.limit).toBeDefined();
  });
});
