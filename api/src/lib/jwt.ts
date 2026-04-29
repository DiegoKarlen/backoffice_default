import jwt, { type SignOptions } from "jsonwebtoken";

export type AccessPayload = {
  sub: string;
  email: string;
};

export function signAccessToken(payload: AccessPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "8h") as SignOptions["expiresIn"];
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyAccessToken(token: string): AccessPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  const decoded = jwt.verify(token, secret);
  if (typeof decoded !== "object" || decoded === null) throw new Error("Invalid token");
  const { sub, email } = decoded as Record<string, unknown>;
  if (typeof sub !== "string" || typeof email !== "string") {
    throw new Error("Invalid token payload");
  }
  return { sub, email };
}
