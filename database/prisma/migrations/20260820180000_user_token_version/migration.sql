-- Invalidate JWT sessions on password change / deactivation via tokenVersion.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
