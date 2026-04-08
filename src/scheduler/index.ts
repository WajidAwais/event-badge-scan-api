import cron from "node-cron";
import type Database from "better-sqlite3";
import { runPollCycle } from "../services/scan.service.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";

export interface PollScheduler {
  /** Stops future ticks and resolves once any in-flight cycle has finished. */
  stop(): Promise<void>;
}

export function startScheduler(db: Database.Database): PollScheduler {
  const pollOptions = {
    source: { url: env.API_URL, token: env.API_TOKEN },
    eventStartDate: env.EVENT_START_DATE,
  };
  let inFlight: Promise<void> | null = null;
  let stopped = false;

  function tick(): void {
    if (stopped) return;
    if (inFlight) {
      logger.warn("Poll cycle already in progress, skipping this tick");
      return;
    }
    inFlight = runPollCycle(db, pollOptions)
      .catch((err: unknown) => {
        // Log the message only: transport errors carry the request body, which holds the token.
        // The next tick resumes from the last committed checkpoint.
        const reason = err instanceof Error ? err.message : String(err);
        logger.error({ reason }, "Poll cycle failed after all retries, will resume next tick");
      })
      .finally(() => {
        inFlight = null;
      });
  }

  logger.info({ cron: env.POLL_INTERVAL_CRON }, "Starting poll scheduler");
  const task = cron.schedule(env.POLL_INTERVAL_CRON, tick);

  // Poll once at startup instead of waiting for the first cron tick.
  tick();

  return {
    async stop() {
      stopped = true;
      await task.stop();
      await inFlight;
    },
  };
}
