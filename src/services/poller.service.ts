import axios from "axios";
import { MAX_BATCH_SIZE } from "../config/constants.js";
import { ApiResponseSchema } from "../types/api.js";
import type { RawScan } from "../types/api.js";
import { retryWithBackoff } from "../utils/retry.js";
import { logger } from "../utils/logger.js";
import { parseScanDate } from "../utils/scan-date.js";

/** Keep millisecond precision so split windows do not round away boundary rows. */
function boundsToQueryParams(loMs: number, hiMs: number): { scanDateGT: string; scanDateLT: string } {
  if (loMs >= hiMs) {
    throw new Error("scanDateGT must be strictly less than scanDateLT");
  }
  const loIso = new Date(loMs).toISOString();
  const hiIso = new Date(hiMs).toISOString();
  return { scanDateGT: loIso.slice(0, 23), scanDateLT: hiIso.slice(0, 23) };
}

/** Where scans are fetched from; passed in so tests can point at a local fake provider. */
export interface ScanSource {
  url: string;
  token: string;
}

function buildScanUrl(source: ScanSource, scanDateGT: string, scanDateLT: string): string {
  const u = new URL(source.url);
  u.searchParams.set("scanDateGT", scanDateGT);
  u.searchParams.set("scanDateLT", scanDateLT);
  return u.toString();
}

async function fetchBatchBetween(source: ScanSource, loMs: number, hiMs: number): Promise<RawScan[]> {
  const { scanDateGT, scanDateLT } = boundsToQueryParams(loMs, hiMs);
  const url = buildScanUrl(source, scanDateGT, scanDateLT);

  const response = await axios.post<unknown>(url, { token: source.token }, {
    headers: { "Content-Type": "application/json" },
    timeout: 30_000,
    validateStatus: () => true,
    maxRedirects: 0,
    maxContentLength: 8 * 1024 * 1024,
  });

  if (response.status !== 200) {
    logger.error({ status: response.status, url }, "Scan API non-200 response");
    throw new Error(`Scan API returned status ${response.status}`);
  }

  const contentType = String(response.headers["content-type"] ?? "");
  if (!contentType.includes("application/json")) {
    logger.error({ contentType, url }, "Scan API response is not JSON");
    throw new Error("Scan API response must be application/json");
  }

  const parsed = ApiResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues, url }, "API response validation failed");
    throw new Error("Invalid API response shape");
  }

  return parsed.data;
}

/**
 * Recursively subdivides the exclusive window (loMs, hiMs) until each API response
 * has fewer than MAX_BATCH_SIZE rows, so no poll cycle stops after a single full page.
 */
async function* fetchRangeMs(source: ScanSource, loMs: number, hiMs: number): AsyncGenerator<RawScan[]> {
  if (loMs >= hiMs) {
    return;
  }

  logger.info({ loMs, hiMs }, "Fetching scan range from API");

  const batch = await retryWithBackoff(() => fetchBatchBetween(source, loMs, hiMs));

  logger.info({ count: batch.length, loMs, hiMs }, "Scan range batch received");

  if (batch.length === 0) {
    return;
  }

  if (batch.length < MAX_BATCH_SIZE) {
    yield batch;
    return;
  }

  // Overflow: split the time window (not cursor-by-max-date) so duplicate scanDate
  // values cannot hide rows beyond the first 1000.
  if (hiMs - loMs <= 2) {
    throw new Error(
      "Scan fetch: more than 1000 scans at a millisecond boundary; cannot subdivide further. Check API or clock precision.",
    );
  }

  const midMs = Math.floor((loMs + hiMs) / 2);
  let split = midMs;
  if (split <= loMs) {
    split = loMs + 1;
  }
  if (split >= hiMs) {
    split = hiMs - 1;
  }

  if (split <= loMs || split >= hiMs) {
    throw new Error("Scan fetch: could not compute an interior split point for overflow batch");
  }

  yield* fetchRangeMs(source, loMs, split);
  // Exclusive bounds need a one-millisecond overlap to retain the split instant.
  yield* fetchRangeMs(source, split - 1, hiMs);
}

/**
 * Fetches all scans in the exclusive interval (fromDate, upperBoundExclusive) using
 * scanDateGT + scanDateLT on every request. Yields each sub-batch in ascending time
 * order so checkpoint advancement stays monotonic.
 */
export async function* fetchAllScansInRange(
  source: ScanSource,
  fromDate: string,
  upperBoundExclusive: string,
): AsyncGenerator<RawScan[]> {
  const loMs = parseScanDate(fromDate);
  const hiMs = parseScanDate(upperBoundExclusive);
  if (loMs >= hiMs) {
    logger.warn({ fromDate, upperBoundExclusive }, "Empty fetch range (lower >= upper), skipping");
    return;
  }
  yield* fetchRangeMs(source, loMs, hiMs);
}
