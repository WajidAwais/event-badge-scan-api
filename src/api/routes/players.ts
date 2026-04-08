import { Router } from "express";
import type Database from "better-sqlite3";
import { NotFoundError } from "../errors/app-error.js";
import { sendSuccess } from "../utils/respond.js";
import { createPlayerRepository } from "../../repositories/player.repository.js";
import { createScanRepository } from "../../repositories/scan.repository.js";

const MAX_SCANS_PER_PLAYER = 1000;

export function createPlayersRouter(db: Database.Database): Router {
  const router = Router();
  const playerRepo = createPlayerRepository(db);
  const scanRepo = createScanRepository(db);

  router.get("/players", (_req, res) => {
    const players = playerRepo.getAllPlayerCounts();
    sendSuccess(res, { players, total: players.length });
  });

  router.get("/players/top", (_req, res) => {
    const player = playerRepo.getTopPlayer();
    if (!player) {
      throw new NotFoundError("No players found", null, "PLAYERS_EMPTY");
    }
    sendSuccess(res, { player });
  });

  router.get("/players/bottom", (_req, res) => {
    const player = playerRepo.getBottomPlayer();
    if (!player) {
      throw new NotFoundError("No players found", null, "PLAYERS_EMPTY");
    }
    sendSuccess(res, { player });
  });

  router.get("/players/:badgeId", (req, res) => {
    const { badgeId } = req.params;
    const player = playerRepo.getPlayerById(badgeId);
    if (!player) {
      throw new NotFoundError("Player not found", { badgeId }, "PLAYER_NOT_FOUND");
    }
    const { rows: scans } = scanRepo.searchScans({ badgeId, limit: MAX_SCANS_PER_PLAYER, offset: 0 });
    sendSuccess(res, {
      ...player,
      scans: scans.map((s) => ({ boothName: s.booth_name, scanDate: s.scan_date })),
    });
  });

  return router;
}
