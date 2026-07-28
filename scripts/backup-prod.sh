#!/usr/bin/env bash
# Kunlik Postgres + MinIO backup — cron: 0 2 * * * /home/call/scripts/backup-prod.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -p aicc-call -f infra/docker-compose.prod.yml --env-file infra/.env.prod)
set -a
# shellcheck disable=SC1091
source infra/.env.prod
set +a
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR:-/home/call/backups}/$STAMP"
mkdir -p "$OUT/minio"
chmod 700 "$OUT"

echo "==> Postgres dump"
"${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$OUT/aicc.dump"
chmod 600 "$OUT/aicc.dump"

echo "==> MinIO mirror (recordings)"
docker run --rm --network aicc_call_net \
  -e S3_ACCESS_KEY="${S3_ACCESS_KEY}" \
  -e S3_SECRET_KEY="${S3_SECRET_KEY}" \
  -e S3_BUCKET="${S3_BUCKET}" \
  -v "$OUT/minio:/backup" \
  --entrypoint /bin/sh \
  minio/mc:latest \
  -c 'mc alias set local http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" && mc mirror --overwrite "local/$S3_BUCKET" /backup'
chmod -R go-rwx "$OUT/minio" 2>/dev/null || true

find "${BACKUP_DIR:-/home/call/backups}" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +

echo "OK $OUT (pg=$(du -h "$OUT/aicc.dump" | cut -f1), minio=$(du -sh "$OUT/minio" 2>/dev/null | cut -f1 || echo 0))"
