import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

/** Brute-force protection for admin and player login endpoints. */
export const loginRateLimiter = rateLimit({
  windowMs: env.authLoginRateLimitWindowMs,
  max: env.authLoginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});
