-- CreateTable
CREATE TABLE "CluePoolItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "clueText" TEXT NOT NULL DEFAULT '',
    "locationHint" TEXT NOT NULL DEFAULT '',
    "answer" TEXT NOT NULL DEFAULT '',
    "targetLat" REAL,
    "targetLng" REAL,
    "triggerRadiusMeters" INTEGER NOT NULL DEFAULT 25,
    "durationSecs" INTEGER,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "hintsJson" TEXT NOT NULL DEFAULT '[]',
    "socialLinksJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Penalty_teamId_idx" ON "Penalty"("teamId");

-- CreateIndex
CREATE INDEX "Photo_teamId_submittedAt_idx" ON "Photo"("teamId", "submittedAt");

-- CreateIndex
CREATE INDEX "Photo_status_idx" ON "Photo"("status");

-- CreateIndex
CREATE INDEX "TeamLevelProgress_teamId_idx" ON "TeamLevelProgress"("teamId");

-- CreateIndex
CREATE INDEX "TeamLocation_teamId_recordedAt_idx" ON "TeamLocation"("teamId", "recordedAt");

-- CreateIndex
CREATE INDEX "TeamSession_teamId_idx" ON "TeamSession"("teamId");
