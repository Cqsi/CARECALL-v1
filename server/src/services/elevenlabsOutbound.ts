import { config } from "../config.js";

export type OutboundCallRequest = {
  toNumber: string;
  instructions: string;
};

export type OutboundCallResult = {
  success: boolean;
  message: string;
  conversationId: string | null;
  callId: string | null;
};

function assertConfigured(): void {
  const missing = [
    ["ELEVENLABS_API_KEY", config.elevenLabsApiKey],
    ["ELEVENLABS_AGENT_ID", config.elevenLabsAgentId],
    ["ELEVENLABS_AGENT_PHONE_NUMBER_ID", config.elevenLabsAgentPhoneNumberId]
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(`Missing ElevenLabs outbound configuration: ${missing.map(([key]) => key).join(", ")}`);
  }
}

function endpoint(): string {
  const kind = config.elevenLabsOutboundProvider === "sip" ? "sip-trunk" : "twilio";
  return `https://api.elevenlabs.io/v1/convai/${kind}/outbound-call`;
}

function normalizePhoneNumber(value: string): string {
  return value.replace(/\s+/g, "");
}

export async function startElevenLabsOutboundCall(request: OutboundCallRequest): Promise<OutboundCallResult> {
  assertConfigured();

  const toNumber = normalizePhoneNumber(request.toNumber);
  if (!/^\+[1-9]\d{7,14}$/.test(toNumber)) {
    throw new Error("Phone number must use E.164 format, for example +358401234567.");
  }

  const instructions = request.instructions.trim();
  if (instructions.length < 8) {
    throw new Error("Please add a short description of what the agent should ask.");
  }

  const conversationInitiationClientData: Record<string, unknown> = {
    type: "conversation_initiation_client_data",
    dynamic_variables: {
      customer_name: config.customerName,
      call_instructions: instructions
    }
  };

  if (config.elevenLabsUseConversationOverrides) {
    conversationInitiationClientData.conversation_config_override = {
      agent: {
        first_message: `Hi ${config.customerName}, this is CareCall. I am calling for a quick check-in.`,
        prompt: {
          prompt: [
            `You are CareCall, making an outbound welfare check-in call to ${config.customerName}.`,
            "Follow this specific instruction from the care dashboard:",
            instructions,
            "Keep the tone warm, concise, and calm. Ask follow-up questions if the answer suggests risk, discomfort, confusion, loneliness, medication issues, or mobility trouble.",
            "At the end, briefly summarize what you will note for the care team."
          ].join("\n\n")
        }
      }
    };
  }

  const body = {
    agent_id: config.elevenLabsAgentId,
    agent_phone_number_id: config.elevenLabsAgentPhoneNumberId,
    to_number: toNumber,
    conversation_initiation_client_data: conversationInitiationClientData
  };

  const response = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": config.elevenLabsApiKey
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload);
    throw new Error(`ElevenLabs outbound call failed (${response.status}): ${detail}`);
  }

  return {
    success: payload.success === true,
    message: typeof payload.message === "string" ? payload.message : "Outbound call initiated.",
    conversationId: typeof payload.conversation_id === "string" ? payload.conversation_id : null,
    callId: typeof payload.callSid === "string"
      ? payload.callSid
      : typeof payload.sip_call_id === "string"
        ? payload.sip_call_id
        : null
  };
}
