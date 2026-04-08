import { z } from "zod";

const EnvSchema = z.object({
  // Loopback by default: the API is unauthenticated. The container image sets 0.0.0.0.
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(3000),
  API_URL: z.url({ protocol: /^https?$/ }),
  API_TOKEN: z.string().min(1),
  EVENT_START_DATE: z.iso.datetime({ offset: true }).default(new Date(0).toISOString()),
  POLL_INTERVAL_CRON: z.string().default("*/5 * * * *"),
  DB_PATH: z.string().default("./data/booth-scans.db"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "[config] Invalid environment variables:\n",
    z.flattenError(parsed.error).fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof parsed.data;
