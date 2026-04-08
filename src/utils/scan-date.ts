const ZONE_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parses a provider timestamp to epoch milliseconds. The scan API sends
 * `2026-02-04T10:00:00.123` with no zone designator; `Date.parse` would read that
 * as host-local time, so zone-less date-times are treated as UTC here.
 */
export function parseScanDate(value: string): number {
  const needsZone = value.includes("T") && !ZONE_SUFFIX.test(value);
  const ms = Date.parse(needsZone ? `${value}Z` : value);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid date string: ${value}`);
  }
  return ms;
}

/** Canonical stored form: UTC ISO-8601 with milliseconds, which also sorts as text. */
export function toCanonicalScanDate(value: string): string {
  return new Date(parseScanDate(value)).toISOString();
}
