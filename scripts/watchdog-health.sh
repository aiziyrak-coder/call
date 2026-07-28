#!/usr/bin/env bash
# Health watchdog — cron: */5 * * * * /home/call/scripts/watchdog-health.sh
# Muvaffaqiyatsizlikda log + ixtiyoriy webhook (ALERT_WEBHOOK_URL).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${LOG_DIR:-/home/call/logs}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/watchdog.log"
URL="${HEALTH_URL:-https://call.devflix.uz/api/v1/health}"

alert() {
  local msg="$1"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) FAIL $msg" >>"$LOG"
  if [[ -f "$ROOT/infra/.env.prod" ]]; then
    # shellcheck disable=SC1091
    set -a; source "$ROOT/infra/.env.prod"; set +a
  fi
  if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
    curl -fsS -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":\"AiCC health FAIL: $msg\"}" \
      "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true
  fi
}

body="$(curl -fsS -m 10 "$URL" 2>/dev/null || true)"
code="$(curl -fsS -m 10 -o /dev/null -w '%{http_code}' "$URL" 2>/dev/null || echo 000)"

if [[ "$code" != "200" ]]; then
  alert "HTTP $code"
  exit 1
fi
if ! echo "$body" | grep -q '"status":"ok"'; then
  alert "degraded: $body"
  exit 1
fi

# Disk 90%+ ogohlantirish
use="$(df -P /home/call 2>/dev/null | awk 'NR==2{gsub(/%/,"",$5); print $5}')"
if [[ -n "$use" && "$use" -ge 90 ]]; then
  alert "disk ${use}% full on /home/call"
fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) OK" >>"$LOG"
# Log rotatsiya (oxirgi 2000 qator)
tail -n 2000 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit 0
