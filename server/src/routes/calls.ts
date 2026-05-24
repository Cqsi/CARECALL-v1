import { Router } from "express";
import { config } from "../config.js";
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

callsRouter.post("/escalate", async (req, res) => {
  try {
    if (!config.elevenLabsNurseAgentId) {
      throw new Error("Missing ElevenLabs outbound configuration: ELEVENLABS_NURSE_AGENT_ID");
    }

    const nurseName = String(req.body?.nurseName ?? "");
    const nursePhoneNumber = String(req.body?.nursePhoneNumber ?? "");
    const patientName = String(req.body?.patientName ?? config.customerName);
    const patientPhoneNumber = String(req.body?.patientPhoneNumber ?? "");
    const summary = String(req.body?.summary ?? "A CareCall conversation was flagged for nurse follow-up.");
    const latestCallAt = String(req.body?.latestCallAt ?? "");

    const instructions = [
      `Call nurse ${nurseName || "the selected nurse"} about a CareCall escalation.`,
      `Patient: ${patientName}.`,
      patientPhoneNumber ? `Patient phone number: ${patientPhoneNumber}.` : "",
      latestCallAt ? `Latest call time: ${latestCallAt}.` : "",
      `Situation summary: ${summary}`,
      "Confirm that the nurse has understood the situation and ask if they have any questions.",
      "Answer only from the provided context. If asked for information you do not have, say that the dashboard contains the full transcript."
    ].filter(Boolean).join("\n");

    const result = await startElevenLabsOutboundCall({
      agentId: config.elevenLabsNurseAgentId,
      toNumber: nursePhoneNumber,
      instructions,
      callType: "nurse_escalation",
      firstMessage: `Hi ${nurseName || "there"}, this is CareCall calling with a patient escalation.`,
      dynamicVariables: {
        nurse_name: nurseName,
        nurse_phone_number: nursePhoneNumber,
        patient_name: patientName,
        patient_phone_number: patientPhoneNumber,
        escalation_summary: summary,
        latest_call_at: latestCallAt
      }
    });

    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start nurse escalation call.";
    const status = message.startsWith("Missing ElevenLabs")
      ? 503
      : message.startsWith("ElevenLabs outbound call failed")
        ? 502
        : 400;
    res.status(status).json({ error: message });
  }
});
