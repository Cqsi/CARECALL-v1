import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../services/auth.js";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.header("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token || !verifyAuthToken(token)) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  next();
}
