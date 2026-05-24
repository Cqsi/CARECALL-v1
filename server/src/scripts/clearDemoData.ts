import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import initSqlJs from "sql.js";
import { config } from "../config.js";
import { createDatabase } from "../db.js";

function parseSqliteFilePath(databaseUrl: string): string {
  return databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;
}

async function clearPostgres(): Promise<void> {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined
  });

  try {
    await pool.query("DELETE FROM calls");
    await pool.query("DELETE FROM callers");
  } finally {
    await pool.end();
  }
}

async function clearSqlite(): Promise<void> {
  const SQL = await initSqlJs();
  const filePath = path.resolve(process.cwd(), parseSqliteFilePath(config.databaseUrl));
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath) : undefined;
  const db = existing ? new SQL.Database(existing) : new SQL.Database();

  try {
    db.run("DELETE FROM calls");
    db.run("DELETE FROM callers");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, db.export());
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const db = createDatabase();
  await db.migrate();
  await db.close();

  if (config.databaseProvider === "postgres") {
    await clearPostgres();
  } else {
    await clearSqlite();
  }

  const verifyDb = createDatabase();
  await verifyDb.migrate();
  const customer = await verifyDb.getOrCreateCustomer(config.customerName);
  await verifyDb.close();

  console.log(`Cleared calls and callers. Demo customer is ready: ${customer.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
