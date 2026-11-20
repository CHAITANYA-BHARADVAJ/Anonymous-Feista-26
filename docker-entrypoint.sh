#!/bin/sh
set -e

echo "=================================================="
echo "🎯 ANONYMOUS SDMCET CAMPUS HUNT 2026 — DOCKER BOOT"
echo "=================================================="

# Ensure database directory exists
mkdir -p /app/packages/server/prisma
mkdir -p /app/packages/server/uploads

SCHEMA_PATH="/app/packages/server/prisma/schema.prisma"
DB_FILE="/app/packages/server/prisma/dev.db"

# Apply Prisma migrations or push schema
echo "📦 Verifying Prisma database schema..."
npx prisma migrate deploy --schema="$SCHEMA_PATH" 2>/dev/null || npx prisma db push --schema="$SCHEMA_PATH"

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
  npx tsx /app/packages/server/prisma/seed.ts || echo "⚠️ Seed completed with notice."
fi

echo "🚀 Starting Node.js server on port ${PORT:-3001}..."
exec node packages/server/dist/index.js
