import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { isAppError } from "../lib/errors.js";
import { httpError, zodFlattenError } from "../lib/route-helpers.js";
import { prisma } from "../lib/prisma.js";
import { verifyPassword } from "../lib/password.js";
import { signAccessToken, signTwoFactorPendingToken, verifyAccessToken } from "../lib/jwt.js";
import { loginRateLimiter } from "../middleware/auth-rate-limit.js";
import { asyncHandler } from "../middleware/async-handler.js";
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

authRouter.post(
  "/login",
  loginRateLimiter,
  asyncHandler(async (req, res) => {
    const body = {
      ...req.body,
      email: typeof req.body?.email === "string" ? req.body.email.trim() : req.body?.email,
    };
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw zodFlattenError(parsed.error);
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findFirst({
      where: { email, active: true },
      include: userInclude,
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw httpError(401, "Invalid credentials");
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
  }),
);

authRouter.post(
  "/login/totp",
  loginRateLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginTotpSchema.safeParse(req.body);
    if (!parsed.success) {
      throw zodFlattenError(parsed.error);
    }
    const { twoFactorToken, code } = parsed.data;

    let payload: { sub: string; email: string };
    try {
      const decoded = verifyAccessToken(twoFactorToken);
      if (decoded.kind !== "2fa_pending") {
        throw httpError(401, "Invalid two-factor token");
      }
      payload = { sub: decoded.sub, email: decoded.email };
    } catch (e) {
      if (isAppError(e)) {
        throw e;
      }
      throw httpError(401, "Invalid or expired two-factor token");
    }

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, email: payload.email, active: true },
      include: userInclude,
    });

    if (!user || !user.totpEnabled || !user.totpSecret) {
      throw httpError(401, "Two-factor authentication is not active for this account");
    }

    if (!verifyTotpCode(user.totpSecret, code)) {
      throw httpError(401, "Invalid authenticator code");
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
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth;
    if (!auth) {
      throw httpError(401, "Unauthorized");
    }

    const user = await prisma.user.findFirst({
      where: { id: auth.sub, active: true },
      include: userInclude,
    });

    if (!user) {
      throw httpError(401, "User not found");
    }

    res.json({
      user: publicUserJson(user),
    });
  }),
);

authRouter.post(
  "/totp/setup",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    const user = await prisma.user.findFirst({
      where: { id: auth.sub, active: true },
      select: { id: true, email: true, totpEnabled: true },
    });
    if (!user) {
      throw httpError(404, "User not found");
    }
    if (user.totpEnabled) {
      throw httpError(409, "Two-factor is already enabled. Disable it first to set up again.");
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
  }),
);

authRouter.post(
  "/totp/enable",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = totpEnableSchema.safeParse(req.body);
    if (!parsed.success) {
      throw zodFlattenError(parsed.error);
    }
    const auth = req.auth!;
    const user = await prisma.user.findFirst({
      where: { id: auth.sub, active: true },
      include: userInclude,
    });
    if (!user?.totpSecret) {
      throw httpError(400, "Run setup first (POST /auth/totp/setup)");
    }
    if (user.totpEnabled) {
      throw httpError(409, "Two-factor is already enabled");
    }
    if (!verifyTotpCode(user.totpSecret, parsed.data.code)) {
      throw httpError(401, "Invalid authenticator code");
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
  }),
);

authRouter.post(
  "/totp/disable",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = totpDisableSchema.safeParse(req.body);
    if (!parsed.success) {
      throw zodFlattenError(parsed.error);
    }
    const auth = req.auth!;
    const user = await prisma.user.findFirst({
      where: { id: auth.sub, active: true },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      throw httpError(404, "User not found");
    }
    if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
      throw httpError(401, "Invalid password");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: null, totpEnabled: false },
    });

    res.json({ ok: true });
  }),
);
