CREATE TABLE "RoomCode" (
    "code" TEXT NOT NULL,
    CONSTRAINT "RoomCode_pkey" PRIMARY KEY ("code")
);
INSERT INTO "RoomCode" ("code") SELECT "code" FROM "Room";
ALTER TABLE "Room" ADD COLUMN "expiresAt" TIMESTAMP(3) DEFAULT (CURRENT_TIMESTAMP + interval '24 hours');
CREATE INDEX "Room_expiresAt_idx" ON "Room"("expiresAt");
ALTER TABLE "Room" ADD CONSTRAINT "Room_code_fkey" FOREIGN KEY ("code") REFERENCES "RoomCode"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
