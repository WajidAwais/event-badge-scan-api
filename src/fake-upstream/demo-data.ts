import { toProviderDate, type FakeScan } from "./server.js";

const BOOTHS = ["Hall A / Robotics", "Hall A / Coffee Bar", "Hall B / VR Arena", "Hall B / Merch", "Hall C / Sponsor Lounge"];

/** Small deterministic PRNG (mulberry32) so every run serves the same demo event. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthetic scans spread over the first eight hours after `eventStart`, for 40 demo
 * badges. About one in thirty has no booth name and one in ten keeps it in a second
 * custom-fields entry, matching the shapes the importer has to handle.
 */
export function generateDemoScans(eventStart: string, count: number, seed = 2026): FakeScan[] {
  const random = seededRandom(seed);
  const start = Date.parse(eventStart);
  const span = 8 * 60 * 60 * 1000;

  return Array.from({ length: count }, (_, i) => {
    const badgeId = `demo-badge-${String(1 + Math.floor(random() * 40)).padStart(3, "0")}`;
    const booth = BOOTHS[Math.floor(random() * BOOTHS.length)] as string;
    const scanDate = toProviderDate(start + Math.floor(random() * span));
    const shape = i % 30 === 0 ? "none" : i % 10 === 0 ? "second" : "first";
    const customFields: Record<string, string>[] =
      shape === "none"
        ? [{ Company: "Demo Co" }]
        : shape === "second"
          ? [{ Company: "Demo Co" }, { "Booth Name": booth }]
          : [{ "Booth Name": booth }];
    return { badgeId, scanDate, customFields };
  });
}
