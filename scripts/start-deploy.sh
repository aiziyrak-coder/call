#!/usr/bin/env bash
set -euo pipefail
sed -i 's/\r$//' /home/call/scripts/remote-run-deploy.sh /home/call/scripts/deploy-call-devflix.sh
chmod +x /home/call/scripts/*.sh
nohup bash /home/call/scripts/remote-run-deploy.sh > /home/call/deploy.log 2>&1 &
echo "PID=$!"
sleep 2
tail -n 20 /home/call/deploy.log || true
