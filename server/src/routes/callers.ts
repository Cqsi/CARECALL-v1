import { Router } from "express";
import { config } from "../config.js";
import type { CareCallDatabase } from "../db.js";

export function createCallersRouter(db: CareCallDatabase): Router {
  const router = Router();

  router.patch("/:id", async (req, res) => {
    try {
      const caller = await db.updateCallerName(
        config.customerName,
        req.params.id,
        String(req.body?.name ?? "")
      );
      res.json(caller);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update caller.";
      res.status(message === "Caller not found." ? 404 : 400).json({ error: message });
    }
  });

  return router;
}
