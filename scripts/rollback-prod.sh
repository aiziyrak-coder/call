#!/usr/bin/env bash
# Oldingi muvaffaqiyatli image lariga qaytish (:previous teg).
# Foydalanish: bash scripts/rollback-prod.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -p aicc-call -f infra/docker-compose.prod.yml --env-file infra/.env.prod)
APPS=(api web telephony ai-worker asterisk)

echo "==> :previous image lar mavjudligini tekshirish"
missing=0
for app in "${APPS[@]}"; do
  if ! docker image inspect "aicc-call-${app}:previous" >/dev/null 2>&1; then
    echo "YO'Q: aicc-call-${app}:previous" >&2
    missing=1
  fi
done
[[ "$missing" == "0" ]] || { echo "Rollback imkonsiz — avval kamida bitta muvaffaqiyatli deploy kerak"; exit 1; }

echo "==> :previous -> :latest"
for app in "${APPS[@]}"; do
  docker tag "aicc-call-${app}:previous" "aicc-call-${app}:latest"
done

echo "==> Konteynerlarni qayta ishga tushirish"
for svc in asterisk ai-worker api telephony web; do
  "${COMPOSE[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 180 "$svc"
done

code="$(curl -fsS -o /tmp/aicc-health.json -w '%{http_code}' http://127.0.0.1:14100/api/v1/health || true)"
[[ "$code" == "200" ]] || { echo "API health HTTP $code"; cat /tmp/aicc-health.json 2>/dev/null || true; exit 1; }
grep -q '"status":"ok"' /tmp/aicc-health.json
curl -fsS -o /dev/null -w "https %{http_code}\n" https://call.devflix.uz/api/v1/health
echo "ROLLBACK OK"
