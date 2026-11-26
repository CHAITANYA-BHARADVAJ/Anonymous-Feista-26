-- AlterTable
ALTER TABLE "Team" ADD COLUMN "displayCode" TEXT;
ALTER TABLE "Team" ADD COLUMN "leaderName" TEXT;
ALTER TABLE "Team" ADD COLUMN "mobile" TEXT;

-- CreateTable
CREATE TABLE "TeamPath" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teamId" INTEGER NOT NULL,
    "levelId" INTEGER NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    CONSTRAINT "TeamPath_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeamPath_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Game" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "maxTeams" INTEGER NOT NULL DEFAULT 25,
    "campusMapUrl" TEXT,
    "campusMapBounds" TEXT,
    "startedAt" DATETIME,
    "pausedAt" DATETIME,
    "totalPausedMs" INTEGER NOT NULL DEFAULT 0,
    "endedAt" DATETIME
);
INSERT INTO "new_Game" ("campusMapBounds", "campusMapUrl", "endedAt", "id", "name", "pausedAt", "startedAt", "status", "totalPausedMs") SELECT "campusMapBounds", "campusMapUrl", "endedAt", "id", "name", "pausedAt", "startedAt", "status", "totalPausedMs" FROM "Game";
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
CREATE TABLE "new_TeamLevelProgress" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teamId" INTEGER NOT NULL,
    "levelId" INTEGER NOT NULL,
    "stepNumber" INTEGER NOT NULL DEFAULT 1,
    "unlockedAt" DATETIME NOT NULL,
    "locationReachedAt" DATETIME,
    "completedAt" DATETIME,
    "completedBy" TEXT,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TeamLevelProgress_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeamLevelProgress_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TeamLevelProgress" ("completedAt", "completedBy", "hintsUsed", "id", "levelId", "locationReachedAt", "teamId", "unlockedAt") SELECT "completedAt", "completedBy", "hintsUsed", "id", "levelId", "locationReachedAt", "teamId", "unlockedAt" FROM "TeamLevelProgress";
DROP TABLE "TeamLevelProgress";
ALTER TABLE "new_TeamLevelProgress" RENAME TO "TeamLevelProgress";
CREATE UNIQUE INDEX "TeamLevelProgress_teamId_levelId_key" ON "TeamLevelProgress"("teamId", "levelId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TeamPath_teamId_stepNumber_key" ON "TeamPath"("teamId", "stepNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPath_teamId_levelId_key" ON "TeamPath"("teamId", "levelId");
