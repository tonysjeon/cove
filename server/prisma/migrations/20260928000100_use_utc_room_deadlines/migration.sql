-- Prisma reads timestamp-without-time-zone fields as UTC, regardless of the
-- PostgreSQL session timezone. Normalize the deadlines from the initial backfill.
UPDATE "Room" SET "expiresAt" = ("expiresAt" AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'UTC'
WHERE "expiresAt" IS NOT NULL;
ALTER TABLE "Room" ALTER COLUMN "expiresAt" SET DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + interval '24 hours');
