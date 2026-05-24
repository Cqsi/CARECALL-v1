import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from "sql.js";
import { config } from "./config.js";
import type { DashboardCall, DashboardCaller, DashboardPayload, NormalizedWebhookCall, TranscriptTurn } from "./types.js";

type CustomerRow = {
  id: string;
  name: string;
};

type CallRow = {
  id: string;
  customer_id: string;
  caller_id: string | null;
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

type CallerRow = {
  id: string;
  customer_id: string;
  name: string | null;
  phone_number: string;
  created_at: string;
  updated_at: string;
};

export interface CareCallDatabase {
  migrate(): Promise<void>;
  close(): Promise<void>;
  getOrCreateCustomer(name: string): Promise<CustomerRow>;
  saveCall(customerName: string, call: NormalizedWebhookCall): Promise<string>;
  getDashboard(customerName: string): Promise<DashboardPayload>;
  updateCallerName(customerName: string, callerId: string, name: string): Promise<DashboardCaller>;
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
  caller_id TEXT,
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

const createCallersTableSql = `
CREATE TABLE IF NOT EXISTS callers (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  phone_number TEXT NOT NULL,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, phone_number)
);`;

const createCallsCreatedAtIndexSql = `
CREATE INDEX IF NOT EXISTS calls_customer_created_at_idx
ON calls (customer_id, created_at DESC);`;

const createCallsCallerIndexSql = `
CREATE INDEX IF NOT EXISTS calls_caller_created_at_idx
ON calls (caller_id, created_at DESC);`;

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

function normalizePhoneNumber(phoneNumber: string | null): string | null {
  const trimmed = phoneNumber?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\s+/g, "");
}

function defaultCallerName(phoneNumber: string): string {
  return `Caller ${phoneNumber.slice(-4)}`;
}

function toDashboardCall(call: CallRow | null): DashboardCall | null {
  return call
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
    : null;
}

function toDashboardCaller(caller: CallerRow, latestCall: CallRow | null): DashboardCaller {
  return {
    id: caller.id,
    name: caller.name || defaultCallerName(caller.phone_number),
    phoneNumber: caller.phone_number,
    latestCall: toDashboardCall(latestCall)
  };
}

function toDashboardPayload(customer: CustomerRow, call: CallRow | null, callers: DashboardCaller[]): DashboardPayload {
  return {
    customer,
    latestCall: toDashboardCall(call),
    callers
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

  private queryAll<T>(sql: string, params: SqlValue[] = []): T[] {
    const stmt = this.database.prepare(sql);
    const rows: T[] = [];
    try {
      stmt.bind(params);
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  private runIgnoringDuplicateColumn(sql: string): void {
    try {
      this.database.run(sql);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.toLowerCase().includes("duplicate column")) {
        throw error;
      }
    }
  }

  async migrate(): Promise<void> {
    const SQL = await initSqlJs();
    const existing = fs.existsSync(this.filePath) ? fs.readFileSync(this.filePath) : undefined;
    this.db = existing ? new SQL.Database(existing) : new SQL.Database();
    this.database.run(createCustomersTableSql);
    this.database.run(createCallersTableSql);
    this.database.run(createCallsTableSql);
    this.runIgnoringDuplicateColumn("ALTER TABLE calls ADD COLUMN caller_id TEXT");
    this.database.run(createCallsCreatedAtIndexSql);
    this.database.run(createCallsCallerIndexSql);
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
    const phoneNumber = normalizePhoneNumber(call.callerPhoneNumber);
    const caller = phoneNumber ? await this.getOrCreateCaller(customer.id, phoneNumber) : null;
    const id = randomUUID();
    this.database.run(
      `INSERT INTO calls (
        id, customer_id, caller_id, elevenlabs_conversation_id, caller_phone_number, called_at,
        duration_seconds, transcript_json, transcript_text, summary,
        wellbeing_sentiment, wellbeing_score, raw_webhook_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        customer.id,
        caller?.id ?? null,
        call.elevenLabsConversationId,
        phoneNumber,
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
    const callers = await this.listDashboardCallers(customer.id);
    return toDashboardPayload(customer, call ?? null, callers);
  }

  private async getOrCreateCaller(customerId: string, phoneNumber: string): Promise<CallerRow> {
    const existing = this.queryOne<CallerRow>("SELECT * FROM callers WHERE customer_id = ? AND phone_number = ?", [customerId, phoneNumber]);
    if (existing) {
      return existing;
    }
    const id = randomUUID();
    this.database.run(
      "INSERT INTO callers (id, customer_id, phone_number) VALUES (?, ?, ?)",
      [id, customerId, phoneNumber]
    );
    this.persist();
    return this.queryOne<CallerRow>("SELECT * FROM callers WHERE id = ?", [id]) as CallerRow;
  }

  private async listDashboardCallers(customerId: string): Promise<DashboardCaller[]> {
    const callers = this.queryAll<CallerRow>("SELECT * FROM callers WHERE customer_id = ? ORDER BY updated_at DESC", [customerId]);
    return callers.map((caller) => {
      const latestCall = this.queryOne<CallRow>(
        `SELECT * FROM calls
         WHERE caller_id = ?
         ORDER BY COALESCE(called_at, created_at) DESC
         LIMIT 1`,
        [caller.id]
      );
      return toDashboardCaller(caller, latestCall ?? null);
    });
  }

  async updateCallerName(customerName: string, callerId: string, name: string): Promise<DashboardCaller> {
    const customer = await this.getOrCreateCustomer(customerName);
    const cleanName = name.trim();
    if (!cleanName) {
      throw new Error("Caller name cannot be empty.");
    }
    this.database.run(
      "UPDATE callers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND customer_id = ?",
      [cleanName, callerId, customer.id]
    );
    this.persist();
    const caller = this.queryOne<CallerRow>("SELECT * FROM callers WHERE id = ? AND customer_id = ?", [callerId, customer.id]);
    if (!caller) {
      throw new Error("Caller not found.");
    }
    const latestCall = this.queryOne<CallRow>(
      `SELECT * FROM calls WHERE caller_id = ? ORDER BY COALESCE(called_at, created_at) DESC LIMIT 1`,
      [caller.id]
    );
    return toDashboardCaller(caller, latestCall ?? null);
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
    await this.pool.query(createCallersTableSql);
    await this.pool.query(createCallsTableSql);
    await this.pool.query("ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_id TEXT");
    await this.pool.query(createCallsCreatedAtIndexSql);
    await this.pool.query(createCallsCallerIndexSql);
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
    const phoneNumber = normalizePhoneNumber(call.callerPhoneNumber);
    const caller = phoneNumber ? await this.getOrCreateCaller(customer.id, phoneNumber) : null;
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO calls (
        id, customer_id, caller_id, elevenlabs_conversation_id, caller_phone_number, called_at,
        duration_seconds, transcript_json, transcript_text, summary,
        wellbeing_sentiment, wellbeing_score, raw_webhook_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        customer.id,
        caller?.id ?? null,
        call.elevenLabsConversationId,
        phoneNumber,
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
    const callers = await this.listDashboardCallers(customer.id);
    return toDashboardPayload(customer, latest.rows[0] ?? null, callers);
  }

  private async getOrCreateCaller(customerId: string, phoneNumber: string): Promise<CallerRow> {
    const id = randomUUID();
    const result = await this.pool.query<CallerRow>(
      `INSERT INTO callers (id, customer_id, phone_number)
       VALUES ($1, $2, $3)
       ON CONFLICT (customer_id, phone_number) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [id, customerId, phoneNumber]
    );
    return result.rows[0];
  }

  private async listDashboardCallers(customerId: string): Promise<DashboardCaller[]> {
    const result = await this.pool.query<CallerRow>(
      "SELECT * FROM callers WHERE customer_id = $1 ORDER BY updated_at DESC",
      [customerId]
    );

    return Promise.all(result.rows.map(async (caller) => {
      const latestCall = await this.pool.query<CallRow>(
        `SELECT * FROM calls
         WHERE caller_id = $1
         ORDER BY COALESCE(called_at, created_at) DESC
         LIMIT 1`,
        [caller.id]
      );
      return toDashboardCaller(caller, latestCall.rows[0] ?? null);
    }));
  }

  async updateCallerName(customerName: string, callerId: string, name: string): Promise<DashboardCaller> {
    const customer = await this.getOrCreateCustomer(customerName);
    const cleanName = name.trim();
    if (!cleanName) {
      throw new Error("Caller name cannot be empty.");
    }
    const result = await this.pool.query<CallerRow>(
      `UPDATE callers
       SET name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND customer_id = $3
       RETURNING *`,
      [cleanName, callerId, customer.id]
    );
    const caller = result.rows[0];
    if (!caller) {
      throw new Error("Caller not found.");
    }
    const latestCall = await this.pool.query<CallRow>(
      `SELECT * FROM calls
       WHERE caller_id = $1
       ORDER BY COALESCE(called_at, created_at) DESC
       LIMIT 1`,
      [caller.id]
    );
    return toDashboardCaller(caller, latestCall.rows[0] ?? null);
  }
}

export function createDatabase(): CareCallDatabase {
  if (config.databaseProvider === "postgres") {
    return new PostgresCareCallDatabase(config.databaseUrl);
  }
  return new SqliteCareCallDatabase(config.databaseUrl);
}
