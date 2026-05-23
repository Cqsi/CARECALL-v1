import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from "sql.js";
import { config } from "./config.js";
import type { DashboardPayload, NormalizedWebhookCall, TranscriptTurn } from "./types.js";

type CustomerRow = {
  id: string;
  name: string;
};

type CallRow = {
  id: string;
  customer_id: string;
  elevenlabs_conversation_id: string | null;
  caller_phone_number: string | null;
  called_at: string | null;
  duration_seconds: number | null;
  transcript_json: string | TranscriptTurn[] | null;
  transcript_text: string | null;
  summary: string | null;
  wellbeing_sentiment: string | null;
  wellbeing_score: number | null;
  raw_webhook_json: string | unknown | null;
  created_at: string;
};

export interface CareCallDatabase {
  migrate(): Promise<void>;
  close(): Promise<void>;
  getOrCreateCustomer(name: string): Promise<CustomerRow>;
  saveCall(customerName: string, call: NormalizedWebhookCall): Promise<string>;
  getDashboard(customerName: string): Promise<DashboardPayload>;
}

const createCustomersTableSql = `
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`;

const createCallsTableSql = `
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  elevenlabs_conversation_id TEXT,
  caller_phone_number TEXT,
  called_at TEXT,
  duration_seconds INTEGER,
  transcript_json TEXT NOT NULL,
  transcript_text TEXT,
  summary TEXT,
  wellbeing_sentiment TEXT NOT NULL DEFAULT 'unknown',
  wellbeing_score INTEGER,
  raw_webhook_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`;

const createCallsCreatedAtIndexSql = `
CREATE INDEX IF NOT EXISTS calls_customer_created_at_idx
ON calls (customer_id, created_at DESC);`;

function parseSqliteFilePath(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) {
    return databaseUrl;
  }
  return databaseUrl.slice("file:".length);
}

function parseJsonValue<T>(value: string | T | null, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toDashboardPayload(customer: CustomerRow, call: CallRow | null): DashboardPayload {
  return {
    customer,
    latestCall: call
      ? {
          id: call.id,
          calledAt: call.called_at,
          durationSeconds: call.duration_seconds,
          callerPhoneNumber: call.caller_phone_number,
          wellbeingSentiment: call.wellbeing_sentiment ?? "unknown",
          wellbeingScore: call.wellbeing_score,
          summary: call.summary,
          transcript: parseJsonValue<TranscriptTurn[]>(call.transcript_json, [])
        }
      : null
  };
}

class SqliteCareCallDatabase implements CareCallDatabase {
  private db: SqlJsDatabase | null = null;
  private readonly filePath: string;

  constructor(databaseUrl: string) {
    this.filePath = path.resolve(process.cwd(), parseSqliteFilePath(databaseUrl));
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  private get database(): SqlJsDatabase {
    if (!this.db) {
      throw new Error("SQLite database has not been initialized. Call migrate() first.");
    }
    return this.db;
  }

  private persist(): void {
    const bytes = this.database.export();
    fs.writeFileSync(this.filePath, bytes);
  }

  private queryOne<T>(sql: string, params: SqlValue[] = []): T | undefined {
    const stmt = this.database.prepare(sql);
    try {
      stmt.bind(params);
      if (!stmt.step()) {
        return undefined;
      }
      return stmt.getAsObject() as T;
    } finally {
      stmt.free();
    }
  }

  async migrate(): Promise<void> {
    const SQL = await initSqlJs();
    const existing = fs.existsSync(this.filePath) ? fs.readFileSync(this.filePath) : undefined;
    this.db = existing ? new SQL.Database(existing) : new SQL.Database();
    this.database.run(createCustomersTableSql);
    this.database.run(createCallsTableSql);
    this.database.run(createCallsCreatedAtIndexSql);
    this.persist();
  }

  async close(): Promise<void> {
    this.persist();
    this.database.close();
    this.db = null;
  }

  async getOrCreateCustomer(name: string): Promise<CustomerRow> {
    const existing = this.queryOne<CustomerRow>("SELECT id, name FROM customers WHERE name = ?", [name]);
    if (existing) {
      return existing;
    }

    const customer = { id: randomUUID(), name };
    this.database.run("INSERT INTO customers (id, name) VALUES (?, ?)", [customer.id, customer.name]);
    this.persist();
    return customer;
  }

  async saveCall(customerName: string, call: NormalizedWebhookCall): Promise<string> {
    const customer = await this.getOrCreateCustomer(customerName);
    const id = randomUUID();
    this.database.run(
      `INSERT INTO calls (
        id, customer_id, elevenlabs_conversation_id, caller_phone_number, called_at,
        duration_seconds, transcript_json, transcript_text, summary,
        wellbeing_sentiment, wellbeing_score, raw_webhook_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        customer.id,
        call.elevenLabsConversationId,
        call.callerPhoneNumber,
        call.calledAt,
        call.durationSeconds,
        JSON.stringify(call.transcript),
        call.transcriptText,
        call.summary,
        call.wellbeingSentiment,
        call.wellbeingScore,
        JSON.stringify(call.rawWebhookJson)
      ]
    );
    this.persist();
    return id;
  }

  async getDashboard(customerName: string): Promise<DashboardPayload> {
    const customer = await this.getOrCreateCustomer(customerName);
    const call = this.queryOne<CallRow>(
      `SELECT * FROM calls
       WHERE customer_id = ?
       ORDER BY COALESCE(called_at, created_at) DESC
       LIMIT 1`,
      [customer.id]
    );
    return toDashboardPayload(customer, call ?? null);
  }
}

class PostgresCareCallDatabase implements CareCallDatabase {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined
    });
  }

  async migrate(): Promise<void> {
    await this.pool.query(createCustomersTableSql);
    await this.pool.query(createCallsTableSql);
    await this.pool.query(createCallsCreatedAtIndexSql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getOrCreateCustomer(name: string): Promise<CustomerRow> {
    const existing = await this.pool.query<CustomerRow>("SELECT id, name FROM customers WHERE name = $1", [name]);
    if (existing.rows[0]) {
      return existing.rows[0];
    }

    const id = randomUUID();
    const created = await this.pool.query<CustomerRow>(
      `INSERT INTO customers (id, name)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name`,
      [id, name]
    );
    return created.rows[0];
  }

  async saveCall(customerName: string, call: NormalizedWebhookCall): Promise<string> {
    const customer = await this.getOrCreateCustomer(customerName);
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO calls (
        id, customer_id, elevenlabs_conversation_id, caller_phone_number, called_at,
        duration_seconds, transcript_json, transcript_text, summary,
        wellbeing_sentiment, wellbeing_score, raw_webhook_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        customer.id,
        call.elevenLabsConversationId,
        call.callerPhoneNumber,
        call.calledAt,
        call.durationSeconds,
        JSON.stringify(call.transcript),
        call.transcriptText,
        call.summary,
        call.wellbeingSentiment,
        call.wellbeingScore,
        JSON.stringify(call.rawWebhookJson)
      ]
    );
    return id;
  }

  async getDashboard(customerName: string): Promise<DashboardPayload> {
    const customer = await this.getOrCreateCustomer(customerName);
    const latest = await this.pool.query<CallRow>(
      `SELECT * FROM calls
       WHERE customer_id = $1
       ORDER BY COALESCE(called_at, created_at) DESC
       LIMIT 1`,
      [customer.id]
    );
    return toDashboardPayload(customer, latest.rows[0] ?? null);
  }
}

export function createDatabase(): CareCallDatabase {
  if (config.databaseProvider === "postgres") {
    return new PostgresCareCallDatabase(config.databaseUrl);
  }
  return new SqliteCareCallDatabase(config.databaseUrl);
}
