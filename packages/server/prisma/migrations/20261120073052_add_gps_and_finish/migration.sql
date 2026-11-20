-- AlterTable
ALTER TABLE "Game" ADD COLUMN "campusMapBounds" TEXT;
ALTER TABLE "Game" ADD COLUMN "campusMapUrl" TEXT;

-- AlterTable
ALTER TABLE "Level" ADD COLUMN "targetLat" REAL;
ALTER TABLE "Level" ADD COLUMN "targetLng" REAL;
ALTER TABLE "Level" ADD COLUMN "triggerRadiusMeters" INTEGER DEFAULT 20;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "finishedAt" DATETIME;

-- AlterTable
ALTER TABLE "TeamLevelProgress" ADD COLUMN "locationReachedAt" DATETIME;
