import { Router } from "express";
import { config } from "../config.js";
import { startElevenLabsOutboundCall } from "../services/elevenlabsOutbound.js";
import { sendSms } from "../services/sms.js";

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

callsRouter.post("/escalate", async (req, res) => {
  try {
    const nurseName = String(req.body?.nurseName ?? "");
    const nursePhoneNumber = String(req.body?.nursePhoneNumber ?? "");
    const patientName = String(req.body?.patientName ?? config.customerName);
    const patientPhoneNumber = String(req.body?.patientPhoneNumber ?? "");
    const summary = String(req.body?.summary ?? "A CareCall conversation was flagged for nurse follow-up.");
    const latestCallAt = String(req.body?.latestCallAt ?? "");

    const message = [
      `CareCall escalation${nurseName ? ` for ${nurseName}` : ""}.`,
      `Patient: ${patientName}.`,
      patientPhoneNumber ? `Patient phone: ${patientPhoneNumber}.` : "",
      latestCallAt ? `Latest call: ${latestCallAt}.` : "",
      `Summary: ${summary}`,
      "Please review the CareCall dashboard for the full transcript."
    ].filter(Boolean).join(" ");

    const result = await sendSms({
      toNumber: nursePhoneNumber,
      message
    });

    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send nurse escalation SMS.";
    const status = message.startsWith("Missing SMS")
      ? 503
      : message.startsWith("SMS send failed")
        ? 502
        : 400;
    res.status(status).json({ error: message });
  }
});
