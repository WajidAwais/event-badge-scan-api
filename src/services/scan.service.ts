import type Database from "better-sqlite3";
import type { RawScan } from "../types/api.js";
import type { Scan } from "../types/domain.js";
import { createScanRepository } from "../repositories/scan.repository.js";
import { createPlayerRepository } from "../repositories/player.repository.js";
import { createCheckpointRepository } from "../repositories/checkpoint.repository.js";
import { fetchAllScansInRange } from "./poller.service.js";
import { broadcastPlayerCounts } from "../websocket/broadcaster.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";
import { parseScanDate, toCanonicalScanDate } from "../utils/scan-date.js";

export function toValidScan(raw: RawScan): Scan | null {
  const boothName = raw.customFields?.[0]?.["Booth Name"];
  if (!boothName || boothName.trim() === "") return null;
  return { badgeId: raw.badgeId, boothName: boothName.trim(), scanDate: toCanonicalScanDate(raw.scanDate) };
}

/**
 * Runs one full polling cycle: fetches all pages since the last checkpoint,
 * persists new scans inside atomic transactions, and broadcasts after each page.
 */
export async function runPollCycle(db: Database.Database): Promise<void> {
  const scanRepo = createScanRepository(db);
  const playerRepo = createPlayerRepository(db);
  const checkpointRepo = createCheckpointRepository(db);

  const checkpoint = checkpointRepo.getLastScanDate();
  const fromDate = checkpoint ? new Date(parseScanDate(checkpoint) - 1).toISOString() : env.EVENT_START_DATE;
  const upperBoundExclusive = new Date().toISOString();

  logger.info({ fromDate, upperBoundExclusive }, "Poll cycle started");

  let totalNew = 0;

  for await (const rawBatch of fetchAllScansInRange(fromDate, upperBoundExclusive)) {
    const validScans = rawBatch.flatMap((r) => {
      const scan = toValidScan(r);
      return scan ? [scan] : [];
    });

    // Compare instants, not strings: provider spellings of one instant can differ.
    const maxMsInBatch = Math.max(...rawBatch.map((r) => parseScanDate(r.scanDate)));
    const maxDateInBatch = new Date(maxMsInBatch).toISOString();

    // Persist the batch + advance checkpoint in a single transaction so a crash
    // mid-batch leaves the checkpoint unchanged and the batch will be re-fetched.
    const newInBatch = db.transaction(() => {
      let newScans = 0;

      for (const scan of validScans) {
        const isNew = scanRepo.insertScan(scan);
        if (isNew) {
          playerRepo.incrementScanCount(scan.badgeId, scan.scanDate);
          newScans++;
        }
      }

      checkpointRepo.setLastScanDate(maxDateInBatch);
      return newScans;
    })();

    totalNew += newInBatch;

    logger.info(
      { batchSize: rawBatch.length, validScans: validScans.length, newScans: newInBatch, maxDateInBatch },
      "Batch processed",
    );

    broadcastPlayerCounts(playerRepo.getAllPlayerCounts());
  }

  logger.info({ totalNew }, "Poll cycle complete");
}
