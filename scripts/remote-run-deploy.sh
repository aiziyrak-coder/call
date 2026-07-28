#!/usr/bin/env bash
set -euo pipefail
cd /home/call
git fetch origin
git reset --hard origin/main
sed -i 's/\r$//' scripts/*.sh infra/asterisk/entrypoint.sh || true
chmod +x scripts/*.sh
export COMPOSE_DOCKER_CLI_BUILD=1
export DOCKER_BUILDKIT=1
if command -v ufw >/dev/null 2>&1; then
  ufw allow 10000:10100/udp comment 'aicc-webrtc-rtp' || true
fi
bash scripts/deploy-call-devflix.sh
