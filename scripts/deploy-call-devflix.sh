#!/usr/bin/env bash
# call.devflix.uz — izolatsiyalangan deploy (faqat aicc-call* + shu nginx conf).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -p aicc-call -f infra/docker-compose.prod.yml --env-file infra/.env.prod)
NGINX_AVAIL=/etc/nginx/sites-available/call.devflix.uz
NGINX_ENABLED=/etc/nginx/sites-enabled/call.devflix.uz

if [[ ! -f infra/.env.prod ]]; then
  echo "infra/.env.prod topilmadi" >&2
  exit 1
fi
chmod 600 infra/.env.prod || true

echo "==> Build"
"${COMPOSE[@]}" build

echo "==> Up (minio-init one-shot + healthy servislar)"
# Avval infra + init, keyin app — --wait ishonchliroq
"${COMPOSE[@]}" up -d --wait --wait-timeout 240 \
  postgres redis minio minio-init
"${COMPOSE[@]}" up -d --wait --wait-timeout 300 \
  asterisk ai-worker api telephony web

echo "==> Migratsiya (seed prod da o'chirilgan)"
"${COMPOSE[@]}" exec -T api sh -c 'pnpm exec prisma migrate deploy'
if [[ "${ALLOW_SEED:-0}" == "1" ]]; then
  echo "==> Seed (ALLOW_SEED=1)"
  "${COMPOSE[@]}" exec -T api sh -c 'pnpm exec tsx prisma/seed.ts'
fi

echo "==> Nginx faqat call.devflix.uz"
sudo mkdir -p /var/www/certbot

if [[ ! -d /etc/letsencrypt/live/call.devflix.uz ]]; then
  sudo cp infra/nginx/call.devflix.uz.http.conf "$NGINX_AVAIL"
  sudo ln -sfn "$NGINX_AVAIL" "$NGINX_ENABLED"
  sudo nginx -t
  sudo systemctl reload nginx
  sudo certbot certonly --webroot -w /var/www/certbot \
    -d call.devflix.uz \
    --cert-name call.devflix.uz \
    --non-interactive --agree-tos --register-unsafely-without-email
fi

sudo cp infra/nginx/call.devflix.uz.conf "$NGINX_AVAIL"
sudo ln -sfn "$NGINX_AVAIL" "$NGINX_ENABLED"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Tekshiruv (muvaffaqiyatsizlik = deploy fail)"
"${COMPOSE[@]}" ps
sleep 2
code="$(curl -fsS -o /tmp/aicc-health.json -w '%{http_code}' http://127.0.0.1:14100/api/v1/health)"
[[ "$code" == "200" ]] || { echo "API health HTTP $code"; cat /tmp/aicc-health.json; exit 1; }
grep -q '"status":"ok"' /tmp/aicc-health.json || { echo "API degraded"; cat /tmp/aicc-health.json; exit 1; }
curl -fsS -o /dev/null -w "web   %{http_code}\n" http://127.0.0.1:13100/
curl -fsS -o /dev/null -w "https %{http_code}\n" https://call.devflix.uz/api/v1/health
# RTP portlari ochiqligini tekshirish (UDP listen)
ss -uln | grep -q ':10000' || echo "WARN: RTP 10000 UDP listen ko'rinmadi"
echo "OK https://call.devflix.uz"
