import { Router } from "express";
import { config } from "../config.js";
import type { CareCallDatabase } from "../db.js";
import { normalizeElevenLabsWebhook } from "../services/elevenlabsWebhookMapper.js";

function isAuthorized(reqToken: unknown, headerToken: unknown): boolean {
  if (!config.elevenLabsWebhookToken) {
    return true;
  }
  return reqToken === config.elevenLabsWebhookToken || headerToken === config.elevenLabsWebhookToken;
}

export function createElevenLabsRouter(db: CareCallDatabase): Router {
  const router = Router();

  router.post("/webhook", async (req, res, next) => {
    try {
      if (!isAuthorized(req.query.token, req.header("x-carecall-webhook-token"))) {
        res.status(401).json({ error: "Unauthorized webhook request." });
        return;
      }

      const call = normalizeElevenLabsWebhook(req.body);
      const id = await db.saveCall(config.customerName, call);
      res.status(200).json({ ok: true, id });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
