#!/bin/sh
set -e

echo "=================================================="
echo "🎯 ANONYMOUS SDMCET CAMPUS HUNT 2026 — DOCKER BOOT"
echo "=================================================="

# Ensure data and uploads directories exist
mkdir -p /data
mkdir -p /app/packages/server/uploads

SCHEMA_PATH="/app/packages/server/prisma/schema.prisma"
export DATABASE_URL="${DATABASE_URL:-file:/data/dev.db}"

echo "📦 Database URL: $DATABASE_URL"
echo "📦 Verifying Prisma database schema..."

# Push schema directly to database
npx prisma db push --schema="$SCHEMA_PATH" --accept-data-loss

# Check if database has any existing Game record
COUNT=$(node -e '
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  p.game.count()
    .then(c => { console.log(c); process.exit(0); })
    .catch(() => { console.log(0); process.exit(0); });
' 2>/dev/null || echo "0")

echo "📊 Current active game count in database: $COUNT"

if [ "$COUNT" = "0" ] || [ "${FORCE_SEED:-false}" = "true" ]; then
  echo "🌱 Seeding SDMCET landmarks, default clues, and demo teams..."
  npx tsx /app/packages/server/prisma/seed.ts || echo "⚠️ Seed completed."
fi

echo "🚀 Starting Node.js server on port ${PORT:-3001} (0.0.0.0)..."
exec node packages/server/dist/index.js
