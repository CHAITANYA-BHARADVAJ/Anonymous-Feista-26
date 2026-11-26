#!/bin/sh
set -e

echo "=================================================="
echo "🎯 ANONYMOUS SDMCET CAMPUS HUNT 2026 — DOCKER BOOT"
echo "=================================================="

# Ensure data, backup, and uploads directories exist
mkdir -p /data /data/backups
mkdir -p /app/packages/server/uploads

SCHEMA_PATH="/app/packages/server/prisma/schema.prisma"
export DATABASE_URL="${DATABASE_URL:-file:/data/dev.db}"
DB_FILE="${DATABASE_URL#file:}"

echo "📦 Database URL: $DATABASE_URL"

# Flush WAL and snapshot SQLite database before running migrations
if [ -f "$DB_FILE" ]; then
  echo "💾 Checkpointing & backing up SQLite database before migration..."
  node -e '
    const { PrismaClient } = require("@prisma/client");
    const p = new PrismaClient();
    p.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);").finally(() => p.$disconnect());
  ' 2>/dev/null || true

  BACKUP_PATH="/data/backups/dev.db.pre-migrate-$(date +%Y%m%d%H%M%S)"
  cp "$DB_FILE" "$BACKUP_PATH" && echo "✅ Backup created: $BACKUP_PATH"
  # Retain only the 5 most recent backups to protect EC2 disk space
  ls -1t /data/backups/dev.db.pre-migrate-* 2>/dev/null | tail -n +6 | xargs -r rm -f || true

  # If DB was previously created via `prisma db push` (TeamPath exists without baseline migration recorded),
  # mark baseline migrations as applied so `prisma migrate deploy` remains non-destructive.
  NEEDS_BASELINE=$(node -e '
    const { PrismaClient } = require("@prisma/client");
    const p = new PrismaClient();
    (async () => {
      const tables = await p.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type=\"table\" AND name IN (\"TeamPath\", \"_prisma_migrations\")");
      const names = new Set(tables.map(t => t.name));
      if (!names.has("TeamPath")) { console.log("NO"); return; }
      if (!names.has("_prisma_migrations")) { console.log("ALL"); return; }
      const applied = await p.$queryRawUnsafe("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL");
      const appliedSet = new Set(applied.map(m => m.migration_name));
      const missing = ["20261120070652_init", "20261120073052_add_gps_and_finish", "20261126000001_sync_fiesta_2026_schema"].filter(m => !appliedSet.has(m));
      console.log(missing.join(","));
    })().catch(() => console.log("NO")).finally(() => p.$disconnect());
  ' 2>/dev/null || echo "NO")

  if [ "$NEEDS_BASELINE" = "ALL" ]; then
    for m in 20261120070652_init 20261120073052_add_gps_and_finish 20261126000001_sync_fiesta_2026_schema; do
      npx prisma migrate resolve --applied "$m" --schema="$SCHEMA_PATH" || true
    done
  elif [ -n "$NEEDS_BASELINE" ] && [ "$NEEDS_BASELINE" != "NO" ]; then
    OLD_IFS="$IFS"
    IFS=","
    for m in $NEEDS_BASELINE; do
      npx prisma migrate resolve --applied "$m" --schema="$SCHEMA_PATH" || true
    done
    IFS="$OLD_IFS"
  fi
fi

echo "📦 Applying Prisma database migrations..."
npx prisma migrate deploy --schema="$SCHEMA_PATH"

# Check active Game & CluePoolItem counts
COUNT=$(node -e '
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  p.game.count()
    .then(c => { console.log(c); process.exit(0); })
    .catch(() => { console.log(0); process.exit(0); });
' 2>/dev/null || echo "0")

echo "📊 Current active game count in database: $COUNT"

if [ "$COUNT" = "0" ] || [ "${FORCE_SEED:-false}" = "true" ]; then
  echo "🌱 Seeding SDMCET landmarks, Fiesta 2026 clues, shared Clue Pool, and default teams..."
  npx tsx /app/packages/server/prisma/seed.ts
else
  # Non-destructive backfill of shared CluePoolItem bank when upgrading existing EC2 database
  POOL_COUNT=$(node -e '
    const { PrismaClient } = require("@prisma/client");
    const p = new PrismaClient();
    p.cluePoolItem.count()
      .then(c => { console.log(c); process.exit(0); })
      .catch(() => { console.log(0); process.exit(0); });
  ' 2>/dev/null || echo "0")

  if [ "$POOL_COUNT" = "0" ]; then
    echo "🌱 Backfilling shared Clue Pool library from Fiesta 2026 pack..."
    npx tsx -e '
      import { PrismaClient } from "@prisma/client";
      import { FIESTA_2026_PACK } from "/app/packages/server/src/data/fiesta2026Pack";
      const prisma = new PrismaClient();
      prisma.cluePoolItem.createMany({
        data: FIESTA_2026_PACK.map((item) => ({
          title: item.title,
          clueText: item.clueText,
          locationHint: item.locationHint,
          answer: item.answer,
          targetLat: item.targetLat,
          targetLng: item.targetLng,
          triggerRadiusMeters: item.triggerRadiusMeters,
          durationSecs: item.durationSecs ?? null,
          isFinal: item.isFinal,
          hintsJson: JSON.stringify(item.hints ?? []),
          socialLinksJson: JSON.stringify(item.socialLinks ?? []),
        })),
      }).finally(() => prisma.$disconnect());
    ' || true
  fi
fi

echo "🚀 Starting Node.js server on port ${PORT:-3001} (0.0.0.0)..."
exec node packages/server/dist/index.js
