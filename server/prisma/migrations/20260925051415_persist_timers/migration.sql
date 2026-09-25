-- CreateTable
CREATE TABLE "TimerState" (
    "roomId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "remainingSeconds" DOUBLE PRECISION NOT NULL,
    "startedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimerState_pkey" PRIMARY KEY ("roomId")
);

-- AddForeignKey
ALTER TABLE "TimerState" ADD CONSTRAINT "TimerState_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
