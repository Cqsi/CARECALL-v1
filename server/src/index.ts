import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { createDatabase } from "./db.js";
import { callsRouter } from "./routes/calls.js";
import { createDashboardRouter } from "./routes/dashboard.js";
import { createElevenLabsRouter } from "./routes/elevenlabs.js";
import { healthRouter } from "./routes/health.js";

function createCorsOptions(): cors.CorsOptions {
  if (config.corsOrigins.includes("*")) {
    return { origin: true };
  }
  return {
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked origin: ${origin}`));
    }
  };
}

async function main(): Promise<void> {
  const db = createDatabase();
  await db.migrate();
  await db.getOrCreateCustomer(config.customerName);

  const app = express();
  app.use(cors(createCorsOptions()));
  app.use(express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: string }).rawBody = buf.toString("utf8");
    }
  }));

  app.use("/api/health", healthRouter);
  app.use("/api/dashboard", createDashboardRouter(db));
  app.use("/api/calls", callsRouter);
  app.use("/api/elevenlabs", createElevenLabsRouter(db));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  });

  const server = app.listen(config.port, () => {
    console.log(`CareCall server listening on http://localhost:${config.port}`);
    console.log(`Database provider: ${config.databaseProvider}`);
    console.log(`Demo customer: ${config.customerName}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
