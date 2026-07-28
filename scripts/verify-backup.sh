#!/usr/bin/env bash
# Backup yaratadi va pg_restore -l bilan TOC o'qilishini tekshiradi (prod DB ni o'zgartirmaydi).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
bash "$ROOT/scripts/backup-prod.sh"
LATEST="$(ls -1dt "${BACKUP_DIR:-/home/call/backups}"/*/ 2>/dev/null | head -1 || true)"
[[ -n "$LATEST" && -f "${LATEST}aicc.dump" ]] || { echo "Backup topilmadi"; exit 1; }
echo "==> pg_restore -l (TOC)"
docker compose -p aicc-call -f infra/docker-compose.prod.yml --env-file infra/.env.prod \
  exec -T postgres sh -c 'pg_restore -l' < "${LATEST}aicc.dump" | head -n 30
echo "VERIFY_BACKUP_OK $LATEST"
