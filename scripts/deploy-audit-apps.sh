#!/usr/bin/env bash
set -euo pipefail
cd /home/call
git fetch origin
git reset --hard origin/main
sed -i 's/\r$//' scripts/*.sh || true
chmod +x scripts/*.sh
COMPOSE=(docker compose -p aicc-call -f infra/docker-compose.prod.yml --env-file infra/.env.prod)
export COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1
# Faqat o'zgargan app image lar
"${COMPOSE[@]}" build api web
"${COMPOSE[@]}" up -d --no-deps api web
"${COMPOSE[@]}" up -d --wait --wait-timeout 180 api web
sleep 2
curl -fsS http://127.0.0.1:14100/api/v1/health | head -c 200; echo
curl -fsS -o /dev/null -w "web %{http_code}\n" http://127.0.0.1:13100/
python3 /tmp/smoke-login-check.py 2>/dev/null || true
echo "AUDIT_DEPLOY_OK $(git rev-parse --short HEAD)"
