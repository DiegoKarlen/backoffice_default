import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { verifyPassword } from "../lib/password.js";
import { signAccessToken, signTwoFactorPendingToken, verifyAccessToken } from "../lib/jwt.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { buildOtpauthUrl, generateTotpSecret, verifyTotpCode } from "../lib/totp.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const loginTotpSchema = z.object({
  twoFactorToken: z.string().min(1),
  code: z.string().min(6).max(12),
});

const totpEnableSchema = z.object({
  code: z.string().min(6).max(12),
});

const totpDisableSchema = z.object({
  password: z.string().min(1),
});

const userInclude = {
  roles: {
    include: {
      role: {
        include: {
          functionalities: { include: { functionality: true } },
        },
      },
    },
  },
} as const satisfies Prisma.UserInclude;

type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function functionalityListFromUser(user: UserWithRoles) {
  const functionalities = new Map<string, { code: string; name: string; module: string | null }>();
  for (const ur of user.roles) {
    for (const rf of ur.role.functionalities) {
      const f = rf.functionality;
      functionalities.set(f.id, { code: f.code, name: f.name, module: f.module ?? null });
    }
  }
  return [...functionalities.values()];
}

function publicUserJson(user: UserWithRoles) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    totpEnabled: user.totpEnabled,
    totpPending: Boolean(user.totpSecret) && !user.totpEnabled,
    roles: user.roles.map((r) => ({
      id: r.role.id,
      code: r.role.code,
      name: r.role.name,
    })),
    functionalities: functionalityListFromUser(user),
  };
}

const TOTP_ISSUER = () => process.env.TOTP_ISSUER?.trim() || "Backoffice";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const body = {
    ...req.body,
    email: typeof req.body?.email === "string" ? req.body.email.trim() : req.body?.email,
  };
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { email, active: true },
    include: userInclude,
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.totpEnabled && user.totpSecret) {
    const twoFactorToken = signTwoFactorPendingToken({ sub: user.id, email: user.email });
    res.json({
      requiresTwoFactor: true,
      twoFactorToken,
      expiresIn: process.env.JWT_2FA_EXPIRES_IN ?? "5m",
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    });
    return;
  }

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
  });

  res.json({
    accessToken: token,
    tokenType: "Bearer",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
    user: publicUserJson(user),
  });
});

authRouter.post("/login/totp", async (req, res) => {
  const parsed = loginTotpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { twoFactorToken, code } = parsed.data;

  let payload: { sub: string; email: string };
  try {
    const decoded = verifyAccessToken(twoFactorToken);
    if (decoded.kind !== "2fa_pending") {
      res.status(401).json({ error: "Invalid two-factor token" });
      return;
    }
    payload = { sub: decoded.sub, email: decoded.email };
  } catch {
    res.status(401).json({ error: "Invalid or expired two-factor token" });
    return;
  }

  const user = await prisma.user.findFirst({
    where: { id: payload.sub, email: payload.email, active: true },
    include: userInclude,
  });

  if (!user || !user.totpEnabled || !user.totpSecret) {
    res.status(401).json({ error: "Two-factor authentication is not active for this account" });
    return;
  }

  if (!verifyTotpCode(user.totpSecret, code)) {
    res.status(401).json({ error: "Invalid authenticator code" });
    return;
  }

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
  });

  res.json({
    accessToken: token,
    tokenType: "Bearer",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
    user: publicUserJson(user),
  });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = await prisma.user.findFirst({
    where: { id: auth.sub, active: true },
    include: userInclude,
  });

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json({
    user: publicUserJson(user),
  });
});

authRouter.post("/totp/setup", requireAuth, async (req: AuthedRequest, res) => {
  const auth = req.auth!;
  const user = await prisma.user.findFirst({
    where: { id: auth.sub, active: true },
    select: { id: true, email: true, totpEnabled: true },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.totpEnabled) {
    res.status(409).json({ error: "Two-factor is already enabled. Disable it first to set up again." });
    return;
  }

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: secret, totpEnabled: false },
  });

  const otpauthUrl = buildOtpauthUrl(user.email, TOTP_ISSUER(), secret);
  res.json({
    secret,
    otpauthUrl,
    issuer: TOTP_ISSUER(),
    label: user.email,
  });
});

authRouter.post("/totp/enable", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = totpEnableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const auth = req.auth!;
  const user = await prisma.user.findFirst({
    where: { id: auth.sub, active: true },
    include: userInclude,
  });
  if (!user?.totpSecret) {
    res.status(400).json({ error: "Run setup first (POST /auth/totp/setup)" });
    return;
  }
  if (user.totpEnabled) {
    res.status(409).json({ error: "Two-factor is already enabled" });
    return;
  }
  if (!verifyTotpCode(user.totpSecret, parsed.data.code)) {
    res.status(401).json({ error: "Invalid authenticator code" });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: true },
  });

  const fresh = await prisma.user.findFirst({
    where: { id: user.id },
    include: userInclude,
  });
  res.json({ ok: true, user: fresh ? publicUserJson(fresh) : undefined });
});

authRouter.post("/totp/disable", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = totpDisableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const auth = req.auth!;
  const user = await prisma.user.findFirst({
    where: { id: auth.sub, active: true },
    select: { id: true, passwordHash: true },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: null, totpEnabled: false },
  });

  res.json({ ok: true });
});
