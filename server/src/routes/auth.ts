import { Router } from "express";
import { config } from "../config.js";
import { authIsConfigured, createAuthSecret, createAuthToken, validateCredentials } from "../services/auth.js";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  if (!authIsConfigured()) {
    console.warn(`Auth is not configured. Set AUTH_EMAIL, AUTH_PASSWORD, and AUTH_SECRET. Suggested AUTH_SECRET: ${createAuthSecret()}`);
    res.status(503).json({ error: "Dashboard login is not configured." });
    return;
  }

  const email = String(req.body?.email ?? "");
  const password = String(req.body?.password ?? "");

  if (!validateCredentials(email, password)) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  res.json({
    token: createAuthToken(email),
    expiresInSeconds: config.authTokenTtlSeconds
  });
});
