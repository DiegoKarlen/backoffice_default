import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { verifyPassword } from "../lib/password.js";
import { signAccessToken } from "../lib/jwt.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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
    include: {
      roles: {
        include: {
          role: {
            include: {
              functionalities: { include: { functionality: true } },
            },
          },
        },
      },
    },
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const functionalities = new Map<string, { code: string; name: string; module: string | null }>();
  for (const ur of user.roles) {
    for (const rf of ur.role.functionalities) {
      const f = rf.functionality;
      functionalities.set(f.id, { code: f.code, name: f.name, module: f.module ?? null });
    }
  }
  const functionalityList = [...functionalities.values()];

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
  });

  res.json({
    accessToken: token,
    tokenType: "Bearer",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles.map((r) => ({
        id: r.role.id,
        code: r.role.code,
        name: r.role.name,
      })),
      functionalities: functionalityList,
    },
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
    include: {
      roles: {
        include: {
          role: {
            include: {
              functionalities: { include: { functionality: true } },
            },
          },
        },
      },
    },
  });

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const functionalities = new Map<string, { code: string; name: string; module: string | null }>();
  for (const ur of user.roles) {
    for (const rf of ur.role.functionalities) {
      const f = rf.functionality;
      functionalities.set(f.id, { code: f.code, name: f.name, module: f.module ?? null });
    }
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles.map((r) => ({
        id: r.role.id,
        code: r.role.code,
        name: r.role.name,
      })),
      functionalities: [...functionalities.values()],
    },
  });
});
