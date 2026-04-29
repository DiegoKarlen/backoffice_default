-- DropProject: single-tenant schema (no Project table).

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_projectId_fkey";
ALTER TABLE "Role" DROP CONSTRAINT IF EXISTS "Role_projectId_fkey";
ALTER TABLE "Functionality" DROP CONSTRAINT IF EXISTS "Functionality_projectId_fkey";

DROP INDEX IF EXISTS "Role_projectId_code_key";
DROP INDEX IF EXISTS "Functionality_projectId_code_key";

DROP INDEX IF EXISTS "User_projectId_idx";
DROP INDEX IF EXISTS "Role_projectId_idx";
DROP INDEX IF EXISTS "Functionality_projectId_idx";

ALTER TABLE "User" DROP COLUMN IF EXISTS "projectId";
ALTER TABLE "Role" DROP COLUMN IF EXISTS "projectId";
ALTER TABLE "Functionality" DROP COLUMN IF EXISTS "projectId";

CREATE UNIQUE INDEX IF NOT EXISTS "Role_code_key" ON "Role"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Functionality_code_key" ON "Functionality"("code");

DROP TABLE IF EXISTS "Project";
