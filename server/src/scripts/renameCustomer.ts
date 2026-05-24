import { config } from "../config.js";
import { createDatabase } from "../db.js";

const fromName = process.argv[2];
const toName = process.argv[3] ?? config.customerName;

if (!fromName || !toName) {
  console.error("Usage: tsx src/scripts/renameCustomer.ts <from-name> <to-name>");
  process.exit(1);
}

const db = createDatabase();

try {
  await db.migrate();
  await db.renameCustomer(fromName, toName);
  console.log(`Renamed customer "${fromName}" to "${toName}".`);
} finally {
  await db.close();
}
