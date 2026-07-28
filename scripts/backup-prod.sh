#!/usr/bin/env bash
# Kunlik Postgres + (ixtiyoriy) MinIO backup — cron: 0 2 * * * /home/call/scripts/backup-prod.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -p aicc-call -f infra/docker-compose.prod.yml --env-file infra/.env.prod)
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR:-/home/call/backups}/$STAMP"
mkdir -p "$OUT"
chmod 700 "$OUT"

echo "==> Postgres dump"
"${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$OUT/aicc.dump"
chmod 600 "$OUT/aicc.dump"

# Eski backuplarni o'chirish (14 kun)
find "${BACKUP_DIR:-/home/call/backups}" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +

echo "OK $OUT/aicc.dump ($(du -h "$OUT/aicc.dump" | cut -f1))"
