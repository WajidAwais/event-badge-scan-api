import { z } from "zod";
import { generateDemoScans } from "./demo-data.js";
import { createFakeUpstream } from "./server.js";

const config = z
  .object({
    FAKE_UPSTREAM_HOST: z.string().default("127.0.0.1"),
    FAKE_UPSTREAM_PORT: z.coerce.number().int().min(0).default(4010),
    FAKE_UPSTREAM_TOKEN: z.string().min(1).default("demo-token"),
    FAKE_UPSTREAM_SCANS: z.coerce.number().int().min(0).default(2500),
    EVENT_START_DATE: z.iso.datetime({ offset: true }).default("2026-02-04T08:00:00.000Z"),
  })
  .parse(process.env);

const upstream = createFakeUpstream({
  token: config.FAKE_UPSTREAM_TOKEN,
  scans: generateDemoScans(config.EVENT_START_DATE, config.FAKE_UPSTREAM_SCANS),
});

void upstream.listen(config.FAKE_UPSTREAM_PORT, config.FAKE_UPSTREAM_HOST).then((url) => {
  console.log(`Fake scan provider serving ${config.FAKE_UPSTREAM_SCANS} demo scans at ${url}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => void upstream.close().then(() => process.exit(0)));
}
