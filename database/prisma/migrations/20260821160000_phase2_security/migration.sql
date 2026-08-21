-- Player session invalidation (mirrors User.tokenVersion).
ALTER TABLE "Player" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Finer RBAC for manual wallet credits.
INSERT INTO "Functionality" ("id", "code", "name", "module", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'bo.wallet.manual-credit',
  'Manual wallet credits',
  'game',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RoleFunctionality" ("roleId", "functionalityId")
SELECT r."id", f."id"
FROM "Role" r
CROSS JOIN "Functionality" f
WHERE r."code" = 'admin' AND f."code" = 'bo.wallet.manual-credit'
ON CONFLICT DO NOTHING;
