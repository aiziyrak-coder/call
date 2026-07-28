#!/bin/bash
set -euo pipefail
cd /home/call
sed -i 's/\r$//' scripts/deploy-call-devflix.sh
chmod +x scripts/deploy-call-devflix.sh
export COMPOSE_DOCKER_CLI_BUILD=1
export DOCKER_BUILDKIT=1
bash scripts/deploy-call-devflix.sh
