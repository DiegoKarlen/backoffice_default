-- Public URL segment per room (/r/{slug})
ALTER TABLE "Room" ADD COLUMN "slug" TEXT;

UPDATE "Room" SET "slug" = 'general' WHERE "id" = 'a0000000-0000-4000-8000-000000000001';

UPDATE "Room"
SET "slug" = 'room-' || substring(md5(("id"::text || coalesce("name", ''))), 1, 12)
WHERE "slug" IS NULL;

ALTER TABLE "Room" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Room_slug_key" ON "Room"("slug");
