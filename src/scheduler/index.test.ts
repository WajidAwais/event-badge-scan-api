import { describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { runPollCycle } from "../services/scan.service.js";
import { logger } from "../utils/logger.js";
import { startScheduler } from "./index.js";

vi.mock("../services/scan.service.js", () => ({ runPollCycle: vi.fn() }));

const db = {} as Database.Database;

describe("startScheduler", () => {
  it("polls at startup and stop() waits for the in-flight cycle", async () => {
    let finish!: () => void;
    vi.mocked(runPollCycle).mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));

    const scheduler = startScheduler(db);
    expect(runPollCycle).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopping = scheduler.stop().then(() => (stopped = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(stopped).toBe(false);

    finish();
    await stopping;
    expect(stopped).toBe(true);
  });

  it("logs only the error message when a cycle fails", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const failure = Object.assign(new Error("Scan API returned status 503"), { config: { data: "secret" } });
    vi.mocked(runPollCycle).mockRejectedValueOnce(failure);

    await startScheduler(db).stop();

    expect(error).toHaveBeenCalledWith({ reason: "Scan API returned status 503" }, expect.any(String));
    error.mockRestore();
  });
});
