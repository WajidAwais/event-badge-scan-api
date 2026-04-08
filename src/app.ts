import express from "express";
import type Database from "better-sqlite3";
import healthRouter from "./api/routes/health.js";
import { createPlayersRouter } from "./api/routes/players.js";
import { createScansRouter } from "./api/routes/scans.js";
import { errorHandler } from "./api/middleware/error-handler.js";
import { notFoundHandler } from "./api/middleware/not-found.js";

/** The read-only HTTP API over the scan database. */
export function createApp(db: Database.Database): express.Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(healthRouter);
  app.use(createPlayersRouter(db));
  app.use(createScansRouter(db));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
