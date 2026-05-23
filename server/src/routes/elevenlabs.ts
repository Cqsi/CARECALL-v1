import { Router } from "express";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { config } from "../config.js";
import type { CareCallDatabase } from "../db.js";
import { normalizeElevenLabsWebhook } from "../services/elevenlabsWebhookMapper.js";

type RequestWithRawBody = Parameters<Parameters<Router["post"]>[1]>[0] & {
  rawBody?: string;
};

function isAuthorized(reqToken: unknown, headerToken: unknown): boolean {
  if (!config.elevenLabsWebhookToken) {
    return true;
  }
  return reqToken === config.elevenLabsWebhookToken || headerToken === config.elevenLabsWebhookToken;
}

export function createElevenLabsRouter(db: CareCallDatabase): Router {
  const router = Router();
  const elevenlabs = new ElevenLabsClient();

  router.post("/webhook", async (req, res, next) => {
    try {
      let payload = req.body;

      if (config.elevenLabsWebhookSecret) {
        const rawBody = (req as RequestWithRawBody).rawBody;
        const signature = req.header("elevenlabs-signature");
        if (!rawBody || !signature) {
          res.status(401).json({ error: "Missing ElevenLabs webhook signature." });
          return;
        }
        payload = await elevenlabs.webhooks.constructEvent(rawBody, signature, config.elevenLabsWebhookSecret);
      } else {
        if (!isAuthorized(req.query.token, req.header("x-carecall-webhook-token"))) {
          res.status(401).json({ error: "Unauthorized webhook request." });
          return;
        }
      }

      const call = normalizeElevenLabsWebhook(payload);
      const id = await db.saveCall(config.customerName, call);
      res.status(200).json({ ok: true, id });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
