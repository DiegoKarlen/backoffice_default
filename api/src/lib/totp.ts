import { authenticator } from "otplib";

authenticator.options = { window: 2 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function buildOtpauthUrl(email: string, issuer: string, secret: string): string {
  return authenticator.keyuri(email, issuer, secret);
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const trimmed = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(trimmed)) return false;
  return authenticator.verify({ token: trimmed, secret });
}
