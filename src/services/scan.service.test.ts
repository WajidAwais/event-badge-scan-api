import { beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { RawScan } from "../types/api.js";
import { openDatabase } from "../db/client.js";
import { createCheckpointRepository } from "../repositories/checkpoint.repository.js";
import { createPlayerRepository } from "../repositories/player.repository.js";
import { fetchAllScansInRange } from "./poller.service.js";
import { runPollCycle } from "./scan.service.js";

vi.mock("./poller.service.js", () => ({ fetchAllScansInRange: vi.fn() }));
vi.mock("../websocket/broadcaster.js", () => ({ broadcastPlayerCounts: vi.fn() }));

function scan(badgeId: string, scanDate: string, booth = "Demo booth"): RawScan {
  return { badgeId, scanDate, customFields: [{ "Booth Name": booth }] };
}

function serveBatches(...batches: RawScan[][]): void {
  vi.mocked(fetchAllScansInRange).mockImplementation(async function* () {
    yield* batches;
  });
}

describe("runPollCycle", () => {
  let db: Database.Database;

  beforeEach(() => {
    vi.mocked(fetchAllScansInRange).mockReset();
    db = openDatabase(":memory:");
  });

  it("stores zone-less provider timestamps as UTC ISO strings", async () => {
    serveBatches([scan("demo-badge-001", "2026-02-04T10:00:00.250")]);
    await runPollCycle(db);
    const row = db.prepare<[], { scan_date: string }>("SELECT scan_date FROM scans").get();
    expect(row?.scan_date).toBe("2026-02-04T10:00:00.250Z");
  });

  it("checkpoints the latest instant even when spellings sort differently as text", async () => {
    serveBatches([
      scan("demo-badge-001", "2026-02-04T10:00:00.900"),
      scan("demo-badge-002", "2026-02-04T11:00:00+02:00"),
    ]);
    await runPollCycle(db);
    expect(createCheckpointRepository(db).getLastScanDate()).toBe("2026-02-04T10:00:00.900Z");
  });

  it("does not count a replayed scan twice when its spelling changes", async () => {
    serveBatches([scan("demo-badge-001", "2026-02-04T10:00:00")]);
    await runPollCycle(db);
    serveBatches([scan("demo-badge-001", "2026-02-04T10:00:00.000Z")]);
    await runPollCycle(db);
    expect(createPlayerRepository(db).getPlayerById("demo-badge-001")?.scanCount).toBe(1);
  });

  it("resumes one millisecond before the stored checkpoint", async () => {
    createCheckpointRepository(db).setLastScanDate("2026-02-04T10:00:00.500Z");
    serveBatches();
    await runPollCycle(db);
    expect(vi.mocked(fetchAllScansInRange).mock.calls[0]?.[0]).toBe("2026-02-04T10:00:00.499Z");
  });
});
