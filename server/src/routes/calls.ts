import { Router } from "express";
import { startElevenLabsOutboundCall } from "../services/elevenlabsOutbound.js";

export const callsRouter = Router();

callsRouter.post("/outbound", async (req, res) => {
  try {
    const result = await startElevenLabsOutboundCall({
      toNumber: String(req.body?.toNumber ?? ""),
      instructions: String(req.body?.instructions ?? "")
    });
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start outbound call.";
    const status = message.startsWith("Missing ElevenLabs")
      ? 503
      : message.startsWith("ElevenLabs outbound call failed")
        ? 502
        : 400;
    res.status(status).json({ error: message });
  }
});
