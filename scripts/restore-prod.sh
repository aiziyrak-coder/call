#!/usr/bin/env bash
# Backup'dan Postgres tiklash (MinIO alohida mc mirror).
# DIQQAT: production ma'lumotlarni yozib yuboradi.
# Foydalanish:
#   CONFIRM=YES bash scripts/restore-prod.sh /home/call/backups/20260728T020000Z
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -p aicc-call -f infra/docker-compose.prod.yml --env-file infra/.env.prod)

SRC="${1:-}"
if [[ -z "$SRC" || ! -f "$SRC/aicc.dump" ]]; then
  echo "Foydalanish: CONFIRM=YES $0 /path/to/backup-dir" >&2
  echo "Backup ichida aicc.dump bo'lishi shart." >&2
  exit 1
fi
if [[ "${CONFIRM:-}" != "YES" ]]; then
  echo "Xavfsizlik: CONFIRM=YES bilan qayta ishga tushiring" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source infra/.env.prod
set +a

echo "==> API/telephony vaqtincha to'xtatiladi"
"${COMPOSE[@]}" stop api telephony web || true

echo "==> Postgres restore: $SRC/aicc.dump"
"${COMPOSE[@]}" exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
  < "$SRC/aicc.dump"

if [[ -d "$SRC/minio" && -n "$(ls -A "$SRC/minio" 2>/dev/null || true)" ]]; then
  echo "==> MinIO mirror (backup -> bucket)"
  docker run --rm --network aicc_call_net \
    -e S3_ACCESS_KEY="${S3_ACCESS_KEY}" \
    -e S3_SECRET_KEY="${S3_SECRET_KEY}" \
    -e S3_BUCKET="${S3_BUCKET}" \
    -v "$SRC/minio:/backup:ro" \
    --entrypoint /bin/sh \
    minio/mc:latest \
    -c 'mc alias set local http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" && mc mirror --overwrite /backup "local/$S3_BUCKET"'
fi

echo "==> Servislarni qayta ko'tarish"
"${COMPOSE[@]}" up -d --wait --wait-timeout 180 api telephony web
curl -fsS http://127.0.0.1:14100/api/v1/health
echo
echo "RESTORE OK"
