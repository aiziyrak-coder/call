#!/usr/bin/env bash
# call.devflix.uz — izolatsiyalangan deploy (faqat aicc-call* + shu nginx conf).
# Image lar git SHA bilan teglanadi; rollback: scripts/rollback-prod.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -p aicc-call -f infra/docker-compose.prod.yml --env-file infra/.env.prod)
NGINX_AVAIL=/etc/nginx/sites-available/call.devflix.uz
NGINX_ENABLED=/etc/nginx/sites-enabled/call.devflix.uz
TAG="$(git rev-parse --short HEAD)"
APPS=(api web telephony ai-worker asterisk)

if [[ ! -f infra/.env.prod ]]; then
  echo "infra/.env.prod topilmadi" >&2
  exit 1
fi
chmod 600 infra/.env.prod || true

echo "==> Oldingi image larni :previous deb saqlash (rollback uchun)"
for app in "${APPS[@]}"; do
  if docker image inspect "aicc-call-${app}:latest" >/dev/null 2>&1; then
    docker tag "aicc-call-${app}:latest" "aicc-call-${app}:previous" || true
  fi
done

echo "==> Build (tag=${TAG})"
"${COMPOSE[@]}" build

for app in "${APPS[@]}"; do
  if docker image inspect "aicc-call-${app}:latest" >/dev/null 2>&1; then
    docker tag "aicc-call-${app}:latest" "aicc-call-${app}:${TAG}" || true
  fi
done
echo "$TAG" > /home/call/.aicc-release 2>/dev/null || echo "$TAG" > .aicc-release

echo "==> Infra up"
"${COMPOSE[@]}" up -d postgres redis minio
"${COMPOSE[@]}" up -d --wait --wait-timeout 180 postgres redis minio

echo "==> MinIO bucket init"
"${COMPOSE[@]}" run --rm --entrypoint /bin/sh minio-init -c '
  mc alias set local http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" &&
  mc mb --ignore-existing "local/$S3_BUCKET" &&
  mc version enable "local/$S3_BUCKET" || true &&
  echo bucket_ok
' || "${COMPOSE[@]}" up -d --force-recreate minio-init

for i in $(seq 1 60); do
  st="$("${COMPOSE[@]}" ps -a --format '{{.Name}} {{.Status}}' | grep minio-init || true)"
  echo "$st" | grep -qi 'Exited (0)' && break
  echo "$st" | grep -qi 'Exited' && { echo "minio-init failed: $st"; exit 1; }
  sleep 2
done

echo "==> Rolling app up (ketma-ket, health kutish)"
# Bitta hostda to'liq zero-downtime cheklangan; ketma-ket recreate + wait downtime ni qisqartiradi.
for svc in asterisk ai-worker api telephony web; do
  echo "--> $svc"
  "${COMPOSE[@]}" up -d --no-deps --wait --wait-timeout 180 "$svc" || {
    echo "FAIL $svc — rollback ko'rib chiqing: scripts/rollback-prod.sh" >&2
    exit 1
  }
done

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

echo "==> Tekshiruv"
"${COMPOSE[@]}" ps
sleep 2
code="$(curl -fsS -o /tmp/aicc-health.json -w '%{http_code}' http://127.0.0.1:14100/api/v1/health)"
[[ "$code" == "200" ]] || { echo "API health HTTP $code"; cat /tmp/aicc-health.json; exit 1; }
grep -q '"status":"ok"' /tmp/aicc-health.json || { echo "API degraded"; cat /tmp/aicc-health.json; exit 1; }
curl -fsS -o /dev/null -w "web   %{http_code}\n" http://127.0.0.1:13100/
curl -fsS -o /dev/null -w "https %{http_code}\n" https://call.devflix.uz/api/v1/health
ss -uln | grep -q ':10000' || echo "WARN: RTP 10000 UDP listen ko'rinmadi"
echo "OK https://call.devflix.uz (release=${TAG})"
