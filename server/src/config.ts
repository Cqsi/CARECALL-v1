import dotenv from "dotenv";

dotenv.config();

export type DatabaseProvider = "postgres" | "sqlite";

function readDatabaseProvider(): DatabaseProvider {
  const provider = process.env.DATABASE_PROVIDER ?? "sqlite";
  if (provider !== "postgres" && provider !== "sqlite") {
    throw new Error(`Unsupported DATABASE_PROVIDER "${provider}". Use "postgres" or "sqlite".`);
  }
  return provider;
}

function readPort(): number {
  const rawPort = process.env.PORT ?? "3001";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT "${rawPort}".`);
  }
  return port;
}

export const config = {
  port: readPort(),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseProvider: readDatabaseProvider(),
  databaseUrl: process.env.DATABASE_URL ?? "file:./data/carecall.db",
  databaseSsl: process.env.DATABASE_SSL === "true",
  customerName: process.env.CUSTOMER_NAME ?? "Casimir",
  elevenLabsWebhookToken: process.env.ELEVENLABS_WEBHOOK_TOKEN ?? "",
  elevenLabsWebhookSecret: process.env.ELEVENLABS_WEBHOOK_SECRET ?? "",
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
};
