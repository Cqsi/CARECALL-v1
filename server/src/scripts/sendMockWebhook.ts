const baseUrl = process.env.CARECALL_SERVER_URL ?? "http://localhost:3001";
const token = process.env.ELEVENLABS_WEBHOOK_TOKEN;

const payload = {
  type: "post_call_transcription",
  event_timestamp: Math.floor(Date.now() / 1000),
  data: {
    conversation_id: `demo-${Date.now()}`,
    status: "done",
    transcript: [
      {
        role: "agent",
        message: "Hi Casimir, this is CareCall. How are you feeling today?",
        time_in_call_secs: 0
      },
      {
        role: "user",
        message: "Pretty good overall. I slept okay, just a little tired this morning.",
        time_in_call_secs: 6
      },
      {
        role: "agent",
        message: "Thanks for telling me. Any pain, dizziness, or anything worrying today?",
        time_in_call_secs: 15
      },
      {
        role: "user",
        message: "No, nothing worrying. I have eaten breakfast and I am feeling calm.",
        time_in_call_secs: 24
      }
    ],
    metadata: {
      caller_number: "+358401234567",
      start_time_unix_secs: Math.floor(Date.now() / 1000) - 42,
      call_duration_secs: 42
    },
    analysis: {
      transcript_summary: "Casimir sounded calm and reported no urgent wellbeing concerns.",
      data_collection_results: {
        wellbeing_sentiment: { value: "stable" },
        wellbeing_score: { value: 4 }
      }
    }
  }
};

const url = new URL("/api/elevenlabs/webhook", baseUrl);
if (token) {
  url.searchParams.set("token", token);
}

const response = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload)
});

const text = await response.text();
console.log(`${response.status} ${response.statusText}`);
console.log(text);
