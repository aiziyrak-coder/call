#!/usr/bin/env bash
# call.devflix.uz — izolatsiyalangan deploy (faqat aicc-call* + shu nginx conf).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -p aicc-call -f infra/docker-compose.prod.yml --env-file infra/.env.prod)
NGINX_AVAIL=/etc/nginx/sites-available/call.devflix.uz
NGINX_ENABLED=/etc/nginx/sites-enabled/call.devflix.uz

echo "==> Build + up"
"${COMPOSE[@]}" build
"${COMPOSE[@]}" up -d

echo "==> Migratsiya / seed"
"${COMPOSE[@]}" exec -T api sh -c 'pnpm exec prisma migrate deploy'
"${COMPOSE[@]}" exec -T api sh -c 'pnpm exec tsx prisma/seed.ts' || echo "seed ogohlantirish (davom)"

echo "==> Nginx faqat call.devflix.uz"
sudo mkdir -p /var/www/certbot

if [[ ! -d /etc/letsencrypt/live/call.devflix.uz ]]; then
  sudo cp infra/nginx/call.devflix.uz.http.conf "$NGINX_AVAIL"
  sudo ln -sfn "$NGINX_AVAIL" "$NGINX_ENABLED"
  sudo nginx -t
  sudo systemctl reload nginx
  # Certbot faqat shu domen uchun; boshqa conf larni o'zgartirmaydi (--cert-name).
  sudo certbot certonly --webroot -w /var/www/certbot \
    -d call.devflix.uz \
    --cert-name call.devflix.uz \
    --non-interactive --agree-tos --register-unsafely-without-email
fi

sudo cp infra/nginx/call.devflix.uz.conf "$NGINX_AVAIL"
sudo ln -sfn "$NGINX_AVAIL" "$NGINX_ENABLED"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Tekshiruv"
"${COMPOSE[@]}" ps
sleep 3
curl -fsS -o /dev/null -w "health %{http_code}\n" http://127.0.0.1:14100/api/v1/health || true
curl -fsS -o /dev/null -w "web   %{http_code}\n" http://127.0.0.1:13100/ || true
curl -fsS -o /dev/null -w "https %{http_code}\n" https://call.devflix.uz/api/v1/health || true
echo "OK https://call.devflix.uz"
