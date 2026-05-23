import { Router } from "express";
import { config } from "../config.js";
import type { CareCallDatabase } from "../db.js";

export function createDashboardRouter(db: CareCallDatabase): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const payload = await db.getDashboard(config.customerName);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
