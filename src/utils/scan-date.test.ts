import { describe, expect, it } from "vitest";
import { parseScanDate, toCanonicalScanDate } from "./scan-date.js";

describe("parseScanDate", () => {
  it("reads zone-less provider timestamps as UTC even when the host zone is not UTC", () => {
    const previous = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect(parseScanDate("2026-02-04T10:00:00.250")).toBe(Date.UTC(2026, 1, 4, 10, 0, 0, 250));
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  it("honours an explicit offset", () => {
    expect(parseScanDate("2026-02-04T12:00:00+02:00")).toBe(Date.UTC(2026, 1, 4, 10));
    expect(parseScanDate("2026-02-04T10:00:00Z")).toBe(Date.UTC(2026, 1, 4, 10));
  });

  it("rejects text that is not a date", () => {
    expect(() => parseScanDate("yesterday")).toThrow(/Invalid date/);
  });
});

describe("toCanonicalScanDate", () => {
  it("normalises equivalent spellings of one instant to the same string", () => {
    expect(toCanonicalScanDate("2026-02-04T10:00:00")).toBe("2026-02-04T10:00:00.000Z");
    expect(toCanonicalScanDate("2026-02-04T11:00:00.000+01:00")).toBe("2026-02-04T10:00:00.000Z");
  });
});
