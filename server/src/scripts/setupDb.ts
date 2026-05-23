import { config } from "../config.js";
import { createDatabase } from "../db.js";

const db = createDatabase();

try {
  await db.migrate();
  const customer = await db.getOrCreateCustomer(config.customerName);
  console.log(`Database ready for customer "${customer.name}" (${customer.id}).`);
} finally {
  await db.close();
}
