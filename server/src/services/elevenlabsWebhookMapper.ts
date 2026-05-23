import type { NormalizedWebhookCall, TranscriptTurn } from "../types.js";

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function secondsBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) {
    return null;
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return Math.round((endMs - startMs) / 1000);
}

function timestampToIso(value: unknown): string | null {
  const numeric = asNumber(value);
  if (numeric === null) {
    return asString(value);
  }

  const millis = numeric > 10_000_000_000 ? numeric : numeric * 1000;
  return new Date(millis).toISOString();
}

function normalizeRole(role: unknown): TranscriptTurn["role"] {
  const text = asString(role)?.toLowerCase();
  if (text === "agent" || text === "ai" || text === "assistant") {
    return "agent";
  }
  if (text === "user" || text === "caller" || text === "human") {
    return "user";
  }
  return "unknown";
}

function extractTranscript(data: AnyRecord): TranscriptTurn[] {
  const transcript = Array.isArray(data.transcript) ? data.transcript : [];
  return transcript
    .map((turn) => {
      const row = asRecord(turn);
      const message = asString(row.message) ?? asString(row.text) ?? asString(row.transcript) ?? "";
      return {
        role: normalizeRole(row.role),
        message,
        timeInCallSecs: asNumber(row.time_in_call_secs ?? row.timeInCallSecs)
      };
    })
    .filter((turn) => turn.message.length > 0);
}

function extractCallerPhone(metadata: AnyRecord): string | null {
  const phoneCall = asRecord(metadata.phone_call);
  const phoneCallBody = asRecord(phoneCall.body);
  return (
    asString(metadata.caller_number) ??
    asString(metadata.callerNumber) ??
    asString(metadata.phone_number) ??
    asString(metadata.phoneNumber) ??
    asString(phoneCallBody.from) ??
    asString(phoneCallBody.From) ??
    asString(phoneCallBody.caller)
  );
}

function extractDuration(metadata: AnyRecord, data: AnyRecord): number | null {
  const direct =
    asNumber(metadata.call_duration_secs) ??
    asNumber(metadata.duration_seconds) ??
    asNumber(metadata.durationSeconds) ??
    asNumber(data.duration_seconds);

  if (direct !== null) {
    return Math.round(direct);
  }

  const startedAt = timestampToIso(metadata.start_time_unix_secs ?? metadata.started_at ?? data.started_at);
  const endedAt = timestampToIso(metadata.end_time_unix_secs ?? metadata.ended_at ?? data.ended_at);
  return secondsBetween(startedAt, endedAt);
}

function extractCalledAt(metadata: AnyRecord, data: AnyRecord, eventTimestamp: unknown): string | null {
  return (
    timestampToIso(metadata.start_time_unix_secs) ??
    timestampToIso(metadata.started_at) ??
    timestampToIso(data.started_at) ??
    timestampToIso(eventTimestamp)
  );
}

function extractSummary(analysis: AnyRecord, data: AnyRecord): string | null {
  return (
    asString(analysis.transcript_summary) ??
    asString(analysis.call_summary) ??
    asString(analysis.summary) ??
    asString(data.summary)
  );
}

function extractDataCollectionValue(analysis: AnyRecord, key: string): unknown {
  const dataCollection = asRecord(analysis.data_collection_results);
  const direct = dataCollection[key];
  if (direct === undefined) {
    return undefined;
  }
  const directRecord = asRecord(direct);
  return directRecord.value ?? directRecord.result ?? direct;
}

function extractWellbeingSentiment(analysis: AnyRecord, data: AnyRecord): string {
  return (
    asString(extractDataCollectionValue(analysis, "wellbeing_sentiment")) ??
    asString(analysis.wellbeing_sentiment) ??
    asString(data.wellbeing_sentiment) ??
    "unknown"
  );
}

function extractWellbeingScore(analysis: AnyRecord, data: AnyRecord): number | null {
  return (
    asNumber(extractDataCollectionValue(analysis, "wellbeing_score")) ??
    asNumber(analysis.wellbeing_score) ??
    asNumber(data.wellbeing_score)
  );
}

export function normalizeElevenLabsWebhook(payload: unknown): NormalizedWebhookCall {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const metadata = asRecord(data.metadata);
  const analysis = asRecord(data.analysis);
  const transcript = extractTranscript(data);

  return {
    elevenLabsConversationId: asString(data.conversation_id) ?? asString(root.conversation_id),
    callerPhoneNumber: extractCallerPhone(metadata),
    calledAt: extractCalledAt(metadata, data, root.event_timestamp),
    durationSeconds: extractDuration(metadata, data),
    transcript,
    transcriptText: transcript.map((turn) => `${turn.role}: ${turn.message}`).join("\n") || null,
    summary: extractSummary(analysis, data),
    wellbeingSentiment: extractWellbeingSentiment(analysis, data),
    wellbeingScore: extractWellbeingScore(analysis, data),
    rawWebhookJson: payload
  };
}
