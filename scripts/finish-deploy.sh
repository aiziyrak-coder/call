#!/usr/bin/env bash
# One-shot tugatish: yangi image lar + nginx + smoke
set -euo pipefail
cd /home/call
git fetch origin
git reset --hard origin/main
sed -i 's/\r$//' scripts/*.sh infra/asterisk/entrypoint.sh || true
chmod +x scripts/*.sh
COMPOSE=(docker compose -p aicc-call -f infra/docker-compose.prod.yml --env-file infra/.env.prod)

# Eski tiqilib qolgan compose
pkill -f 'docker compose up --build' 2>/dev/null || true

if command -v ufw >/dev/null 2>&1; then
  ufw allow 10000:10100/udp comment 'aicc-webrtc-rtp' || true
fi

export COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1
"${COMPOSE[@]}" up -d --force-recreate --build asterisk ai-worker api telephony web
"${COMPOSE[@]}" up -d --wait --wait-timeout 300 asterisk ai-worker api telephony web

"${COMPOSE[@]}" exec -T api sh -c 'pnpm exec prisma migrate deploy'

sudo cp infra/nginx/call.devflix.uz.conf /etc/nginx/sites-available/call.devflix.uz
sudo nginx -t
sudo systemctl reload nginx

sleep 3
code="$(curl -fsS -o /tmp/aicc-health.json -w '%{http_code}' http://127.0.0.1:14100/api/v1/health)"
[[ "$code" == "200" ]] || { echo "API health HTTP $code"; cat /tmp/aicc-health.json; exit 1; }
grep -q '"status":"ok"' /tmp/aicc-health.json || { echo "API degraded"; cat /tmp/aicc-health.json; exit 1; }
curl -fsS -o /dev/null -w "web %{http_code}\n" http://127.0.0.1:13100/
curl -fsS -o /dev/null -w "https %{http_code}\n" https://call.devflix.uz/api/v1/health
ss -uln | grep -E ':1000[0-9]|:10100' | head -5 || echo "WARN: RTP UDP"
"${COMPOSE[@]}" ps
echo "FINISH_OK $(git rev-parse --short HEAD)"
