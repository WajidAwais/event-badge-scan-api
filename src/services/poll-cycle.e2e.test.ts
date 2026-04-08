import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDatabase } from "../db/client.js";
import { generateDemoScans } from "../fake-upstream/demo-data.js";
import { createFakeUpstream, type FakeUpstream } from "../fake-upstream/server.js";
import { createCheckpointRepository } from "../repositories/checkpoint.repository.js";
import { createPlayerRepository } from "../repositories/player.repository.js";
import { toValidScan, runPollCycle } from "./scan.service.js";

// Real HTTP and SQLite: the poller talks to a local fake provider, nothing leaves the host.
const EVENT_START = "2026-02-04T08:00:00.000Z";
const demoScans = generateDemoScans(EVENT_START, 2500);
let upstream: FakeUpstream;
let url: string;

beforeAll(async () => {
  upstream = createFakeUpstream({ token: "demo-token", scans: demoScans });
  url = await upstream.listen(0, "127.0.0.1");
});

afterAll(() => upstream.close());

describe("poll cycle against the fake provider", () => {
  it("imports every boothed scan through a subdivided window, then finds nothing new", async () => {
    const db = openDatabase(":memory:");
    const options = { source: { url, token: "demo-token" }, eventStartDate: EVENT_START };

    await runPollCycle(db, options);

    const expected = new Map<string, number>();
    for (const raw of demoScans) {
      const scan = toValidScan(raw);
      if (scan) expected.set(`${scan.badgeId}|${scan.scanDate}`, (expected.get(`${scan.badgeId}|${scan.scanDate}`) ?? 0) + 1);
    }
    const stored = db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM scans").get()?.n;
    expect(stored).toBe(expected.size);
    expect(upstream.requestCount).toBeGreaterThan(3);

    const players = createPlayerRepository(db).getAllPlayerCounts();
    expect(players.reduce((sum, p) => sum + p.scanCount, 0)).toBe(expected.size);

    const latest = Math.max(...demoScans.map((s) => Date.parse(`${s.scanDate}Z`)));
    expect(createCheckpointRepository(db).getLastScanDate()).toBe(new Date(latest).toISOString());

    await runPollCycle(db, options);
    expect(db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM scans").get()?.n).toBe(expected.size);
  });

  it("fails the cycle when the provider rejects the token", async () => {
    const db = openDatabase(":memory:");
    await expect(
      runPollCycle(db, { source: { url, token: "wrong-token" }, eventStartDate: EVENT_START }),
    ).rejects.toThrow(/status 401/);
    expect(createCheckpointRepository(db).getLastScanDate()).toBeNull();
  }, 15_000);
});
