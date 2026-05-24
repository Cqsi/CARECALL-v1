import { config } from "../config.js";

export type SmsRequest = {
  toNumber: string;
  message: string;
};

export type SmsResult = {
  success: boolean;
  messageSid: string | null;
};

function assertSmsConfigured(): void {
  const missing = [
    ["TWILIO_ACCOUNT_SID", config.twilioAccountSid],
    ["TWILIO_AUTH_TOKEN", config.twilioAuthToken],
    ["TWILIO_FROM_NUMBER", config.twilioFromNumber]
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(`Missing SMS configuration: ${missing.map(([key]) => key).join(", ")}`);
  }
}

function normalizePhoneNumber(value: string): string {
  return value.replace(/\s+/g, "");
}

export async function sendSms(request: SmsRequest): Promise<SmsResult> {
  assertSmsConfigured();

  const toNumber = normalizePhoneNumber(request.toNumber);
  if (!/^\+[1-9]\d{7,14}$/.test(toNumber)) {
    throw new Error("Phone number must use E.164 format, for example +358401234567.");
  }

  const message = request.message.trim();
  if (message.length < 8) {
    throw new Error("SMS message is too short.");
  }

  const body = new URLSearchParams({
    From: config.twilioFromNumber,
    To: toNumber,
    Body: message
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.twilioAccountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof payload.message === "string" ? payload.message : JSON.stringify(payload);
    throw new Error(`SMS send failed (${response.status}): ${detail}`);
  }

  return {
    success: true,
    messageSid: typeof payload.sid === "string" ? payload.sid : null
  };
}
