import http from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeScan {
  badgeId: string;
  scanDate: string;
  customFields: Record<string, string>[];
}

export interface FakeUpstreamOptions {
  token: string;
  scans: FakeScan[];
  /** Rows returned per request; the real provider caps responses at 1,000. */
  pageLimit?: number;
}

export interface FakeUpstream {
  server: http.Server;
  listen(port: number, host: string): Promise<string>;
  close(): Promise<void>;
  /** Count of POST /api/scan requests served, useful for asserting subdivision. */
  readonly requestCount: number;
}

const MAX_BODY_BYTES = 64 * 1024;

/** Formats an instant the way the provider does: UTC, milliseconds, no zone designator. */
export function toProviderDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 23);
}

function parseProviderDate(value: string | null): number {
  if (!value) return Number.NaN;
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown> | null> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk as Buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * A stand-in for the scan provider: POST /api/scan?scanDateGT=..&scanDateLT=.. with a
 * JSON `{ token }` body returns scans strictly inside the window, oldest first, capped
 * at `pageLimit`. POST /demo/scans appends a scan stamped "now" for live demos.
 */
export function createFakeUpstream({ token, scans, pageLimit = 1000 }: FakeUpstreamOptions): FakeUpstream {
  const store = scans
    .map((scan) => ({ scan, ms: parseProviderDate(scan.scanDate) }))
    .sort((a, b) => a.ms - b.ms);
  let requestCount = 0;

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://fake-upstream");

      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true, scans: store.length });
        return;
      }

      if (req.method !== "POST" || (url.pathname !== "/api/scan" && url.pathname !== "/demo/scans")) {
        sendJson(res, 404, { error: "not found" });
        return;
      }

      const body = await readJsonBody(req);
      if (!body) {
        sendJson(res, 400, { error: "expected a JSON object body" });
        return;
      }
      if (body["token"] !== token) {
        sendJson(res, 401, { error: "invalid token" });
        return;
      }

      if (url.pathname === "/demo/scans") {
        const { badgeId, boothName } = body;
        if (typeof badgeId !== "string" || typeof boothName !== "string") {
          sendJson(res, 400, { error: "badgeId and boothName are required strings" });
          return;
        }
        const ms = Date.now();
        const scan = { badgeId, scanDate: toProviderDate(ms), customFields: [{ "Booth Name": boothName }] };
        store.push({ scan, ms });
        sendJson(res, 201, scan);
        return;
      }

      requestCount++;
      const lo = parseProviderDate(url.searchParams.get("scanDateGT"));
      const hi = parseProviderDate(url.searchParams.get("scanDateLT"));
      if (Number.isNaN(lo) || Number.isNaN(hi)) {
        sendJson(res, 400, { error: "scanDateGT and scanDateLT are required timestamps" });
        return;
      }
      const page = store
        .filter((entry) => entry.ms > lo && entry.ms < hi)
        .slice(0, pageLimit)
        .map((entry) => entry.scan);
      sendJson(res, 200, page);
    })();
  });

  return {
    server,
    get requestCount() {
      return requestCount;
    },
    listen(port, host) {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          const { port: bound } = server.address() as AddressInfo;
          resolve(`http://${host}:${bound}/api/scan`);
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
  };
}
