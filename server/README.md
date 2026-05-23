# CareCall Server

Minimal backend for the first CareCall demo flow:

```text
ElevenLabs post-call webhook -> CareCall server -> database -> dashboard API
```

The first customer is seeded as `Casimir`.

## Local setup

```bash
cd server
cp .env.example .env
npm install
npm run db:setup
npm run dev
```

By default the server uses SQLite:

```env
DATABASE_PROVIDER=sqlite
DATABASE_URL=file:./data/carecall.db
```

## Test without ElevenLabs

In another terminal:

```bash
cd server
npm run demo:webhook
curl http://localhost:3001/api/dashboard
```

## ElevenLabs webhook

For a local public webhook during the hackathon:

```bash
cd server
npm run dev
ngrok http 3001
```

Configure ElevenLabs to send post-call webhooks to:

```text
https://YOUR_NGROK_URL/api/elevenlabs/webhook
```

If `ELEVENLABS_WEBHOOK_TOKEN` is set, include it as:

```text
https://YOUR_NGROK_URL/api/elevenlabs/webhook?token=YOUR_TOKEN
```

or send it in the `x-carecall-webhook-token` header.

## Atomidata/Postgres target

Use a Postgres instance on an Atomidata virtual machine:

```env
DATABASE_PROVIDER=postgres
DATABASE_URL=postgres://carecall:password@HOST:5432/carecall
DATABASE_SSL=false
```

Then run:

```bash
npm run db:setup
npm run dev
```

Storage buckets can be added later for audio files or raw webhook archives. For the first dashboard, structured call data belongs in Postgres.

## Dashboard login

The frontend never stores the password. It posts credentials to the backend and stores a short-lived signed token in `sessionStorage`.

Set these in `.env`:

```env
AUTH_EMAIL=your-demo-email@example.com
AUTH_PASSWORD=use-a-private-demo-password
AUTH_SECRET=generate-a-long-random-value
AUTH_TOKEN_TTL_SECONDS=28800
```

Generate a local secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```
