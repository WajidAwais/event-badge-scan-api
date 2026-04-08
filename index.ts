import "dotenv/config";
import http from "http";
import express from "express";
import { env } from "./src/config/env.js";
import { openDatabase } from "./src/db/client.js";
import { createWsServer } from "./src/websocket/server.js";
import { createPlayersRouter } from "./src/api/routes/players.js";
import { createScansRouter } from "./src/api/routes/scans.js";
import healthRouter from "./src/api/routes/health.js";
import { errorHandler } from "./src/api/middleware/error-handler.js";
import { notFoundHandler } from "./src/api/middleware/not-found.js";
import { startScheduler, type PollScheduler } from "./src/scheduler/index.js";
import { createPlayerRepository } from "./src/repositories/player.repository.js";
import { logger } from "./src/utils/logger.js";

const app = express();
app.use(express.json());

const db = openDatabase(env.DB_PATH);

app.use(healthRouter);
app.use(createPlayersRouter(db));
app.use(createScansRouter(db));

app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = http.createServer(app);

const playerRepo = createPlayerRepository(db);
const wss = createWsServer(httpServer, () => playerRepo.getAllPlayerCounts());

let scheduler: PollScheduler | null = null;

httpServer.listen(env.PORT, "127.0.0.1", () => {
  logger.info({ port: env.PORT }, "HTTP + WebSocket server listening");
  scheduler = startScheduler(db);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down gracefully");

  // Let a running poll finish its transaction before the database closes.
  await scheduler?.stop();

  for (const client of wss.clients) client.close(1001, "Server shutting down");
  // Clients that ignore the close frame would otherwise keep httpServer.close() waiting.
  setTimeout(() => wss.clients.forEach((client) => client.terminate()), 2_000).unref();
  wss.close();

  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  db.close();
  logger.info("Shutdown complete");
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
