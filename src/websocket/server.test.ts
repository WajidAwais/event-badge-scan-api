import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import type { WsMessage } from "../types/domain.js";
import { createWsServer } from "./server.js";
import { broadcastPlayerCounts } from "./broadcaster.js";

const servers: http.Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

async function startServer(): Promise<{ url: string; wssClose: () => void }> {
  const server = http.createServer();
  servers.push(server);
  const wss = createWsServer(server, () => [{ badgeId: "demo-badge-001", scanCount: 3, lastScanDate: null }]);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `ws://127.0.0.1:${port}`, wssClose: () => wss.clients.forEach((c) => c.terminate()) };
}

function nextMessage(socket: WebSocket): Promise<WsMessage> {
  return new Promise((resolve) => socket.once("message", (data) => resolve(JSON.parse(String(data)) as WsMessage)));
}

describe("WebSocket feed", () => {
  it("sends a snapshot on connect and broadcasts updates", async () => {
    const { url, wssClose } = await startServer();
    const socket = new WebSocket(url);
    const snapshot = await nextMessage(socket);
    expect(snapshot).toEqual({ type: "snapshot", players: [{ badgeId: "demo-badge-001", scanCount: 3, lastScanDate: null }] });

    const update = nextMessage(socket);
    broadcastPlayerCounts([{ badgeId: "demo-badge-002", scanCount: 1, lastScanDate: "2026-02-04T10:00:00.000Z" }]);
    expect(await update).toEqual({
      type: "update",
      players: [{ badgeId: "demo-badge-002", scanCount: 1, lastScanDate: "2026-02-04T10:00:00.000Z" }],
    });
    socket.close();
    wssClose();
  });
});
