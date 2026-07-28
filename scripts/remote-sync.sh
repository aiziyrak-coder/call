#!/usr/bin/env bash
set -euo pipefail
cd /home/call
git fetch origin
git reset --hard origin/main
chown -R admin_root:admin_root /home/call
sed -i 's/\r$//' scripts/*.sh infra/asterisk/entrypoint.sh || true
chmod +x scripts/*.sh infra/asterisk/entrypoint.sh
if ! grep -q '^ASTERISK_PUBLIC_IP=' infra/.env.prod; then
  echo 'ASTERISK_PUBLIC_IP=87.192.230.208' >> infra/.env.prod
fi
chmod 600 infra/.env.prod
echo "READY $(git rev-parse --short HEAD)"
