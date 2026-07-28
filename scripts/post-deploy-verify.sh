#!/usr/bin/env bash
set -euo pipefail
echo '=== ari.conf (host bind) ==='
cat /home/call/infra/asterisk/config/ari.conf
echo '=== pstn-sim in pjsip ==='
grep -c pstn-sim /home/call/infra/asterisk/config/pjsip.conf || echo 0
echo '=== redis policy ==='
docker exec aicc-call-redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli CONFIG GET maxmemory-policy'
echo '=== telephony health ==='
curl -sS http://127.0.0.1:14101/internal/telephony/health
echo
