export type TranscriptTurn = {
  role: "agent" | "user" | "unknown";
  message: string;
  timeInCallSecs?: number | null;
};

export type DashboardCall = {
  id: string;
  calledAt: string | null;
  durationSeconds: number | null;
  callerPhoneNumber: string | null;
  wellbeingSentiment: string;
  wellbeingScore: number | null;
  summary: string | null;
  transcript: TranscriptTurn[];
};

export type DashboardCaller = {
  id: string;
  name: string;
  phoneNumber: string;
  latestCall: DashboardCall | null;
};

export type DashboardPayload = {
  customer: {
    id: string;
    name: string;
  };
  latestCall: DashboardCall | null;
  callers: DashboardCaller[];
};

export type NormalizedWebhookCall = {
  elevenLabsConversationId: string | null;
  callerPhoneNumber: string | null;
  calledAt: string | null;
  durationSeconds: number | null;
  transcript: TranscriptTurn[];
  transcriptText: string | null;
  summary: string | null;
  wellbeingSentiment: string;
  wellbeingScore: number | null;
  rawWebhookJson: unknown;
};
