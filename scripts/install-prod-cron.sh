#!/usr/bin/env bash
# Production cron: backup (02:00 UTC) + health watchdog (har 5 daqiqa).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
sed -i 's/\r$//' "$ROOT"/scripts/*.sh || true
chmod +x "$ROOT"/scripts/*.sh

CRON_FILE=/etc/cron.d/aicc-call
cat >"$CRON_FILE" <<EOF
# AiCC call.devflix.uz — backup + health
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

0 2 * * * root $ROOT/scripts/backup-prod.sh >> /home/call/logs/backup.log 2>&1
*/5 * * * * root $ROOT/scripts/watchdog-health.sh >/dev/null 2>&1
EOF
chmod 644 "$CRON_FILE"
mkdir -p /home/call/logs /home/call/backups
chmod 700 /home/call/backups
echo "Cron o'rnatildi: $CRON_FILE"
crontab -l 2>/dev/null | grep -v aicc || true
