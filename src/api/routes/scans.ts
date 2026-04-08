import { Router } from "express";
import { z } from "zod";
import type Database from "better-sqlite3";
import { sendSuccess } from "../utils/respond.js";
import { createScanRepository } from "../../repositories/scan.repository.js";

const ScansQuerySchema = z.object({
  badgeId: z.string().optional(),
  boothName: z.string().optional(),
  scanDate: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export function createScansRouter(db: Database.Database): Router {
  const router = Router();
  const scanRepo = createScanRepository(db);

  router.get("/scans", (req, res) => {
    // A ZodError here becomes a 422 VALIDATION_ERROR in the error middleware.
    const { badgeId, boothName, scanDate, limit, offset } = ScansQuerySchema.parse(req.query);

    const { rows, total } = scanRepo.searchScans({ badgeId, boothName, scanDate, limit, offset });

    sendSuccess(res, {
      scans: rows.map((s) => ({
        badgeId: s.badge_id,
        boothName: s.booth_name,
        scanDate: s.scan_date,
      })),
      total,
      limit,
      offset,
    });
  });

  return router;
}
