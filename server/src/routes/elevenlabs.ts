import { Router } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
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

function verifyElevenLabsSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signature = parts.find((part) => part.startsWith("v0="));

  if (!timestamp || !signature) {
    return false;
  }

  const timestampMillis = Number(timestamp) * 1000;
  const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
  if (!Number.isFinite(timestampMillis) || timestampMillis < thirtyMinutesAgo) {
    return false;
  }

  const expected = `v0=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  const expectedBytes = Buffer.from(expected);
  const signatureBytes = Buffer.from(signature);
  return expectedBytes.length === signatureBytes.length && timingSafeEqual(expectedBytes, signatureBytes);
}

export function createElevenLabsRouter(db: CareCallDatabase): Router {
  const router = Router();

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
        if (!verifyElevenLabsSignature(rawBody, signature, config.elevenLabsWebhookSecret)) {
          res.status(401).json({ error: "Invalid ElevenLabs webhook signature." });
          return;
        }
        payload = JSON.parse(rawBody);
      } else {
        if (!isAuthorized(req.query.token, req.header("x-carecall-webhook-token"))) {
          res.status(401).json({ error: "Unauthorized webhook request." });
          return;
        }
      }

      const call = normalizeElevenLabsWebhook(payload);
      const id = await db.saveCall(config.customerName, call);
      console.log(
        `Stored ElevenLabs call ${id}: conversation=${call.elevenLabsConversationId ?? "unknown"} phone=${call.callerPhoneNumber ?? "missing"} turns=${call.transcript.length}`
      );
      res.status(200).json({ ok: true, id });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
