# AiCC Production Runbook

**Sayt:** https://call.devflix.uz  
**Host:** `87.192.230.208` (SSH `admin_root@… -p 2222`)  
**Kod:** `/home/call` · Compose project: `aicc-call`  
**Secrets:** `/home/call/infra/.env.prod` (chmod 600, gitda yo‘q)

---

## Muhitlar

| Muhit | Maqsad | Compose / env |
|-------|--------|----------------|
| **development** | Lokal | `infra/docker-compose.yml` + root `.env` |
| **staging** | Izolyatsiya (ixtiyoriy) | `infra/docker-compose.staging.yml` + `infra/.env.staging` |
| **production** | Real trafik | `infra/docker-compose.prod.yml` + `infra/.env.prod` |

Qoida: production DB/volume hech qachon staging/dev bilan ulashilmasin. Seed faqat `ALLOW_SEED=1`.

---

## Environment o‘zgaruvchilari

To‘liq namuna: `infra/.env.prod.template` va `.env.example`.

| Guruh | Kalitlar | Nima uchun |
|-------|----------|------------|
| Core | `NODE_ENV=production`, portlar | Debug/Swagger o‘chadi |
| DB | `POSTGRES_*`, pool `connection_limit` (compose) | Prisma pool |
| Redis | `REDIS_PASSWORD` | Cache, lockout, pub/sub |
| Auth | `JWT_*` (≥32 prod), cookies | Sessiya |
| S3 | `S3_*`, `RECORDING_ENCRYPTION_KEY` | Yozuvlar |
| Telephony | `ARI_*`, `SERVICE_TOKEN`, `ASTERISK_*` | Asterisk |
| SMS/AI | `DEVICE_ENROLLMENT_SECRET`, `OPENAI_API_KEY` | Companion / STT |
| Ops | `ALERT_WEBHOOK_URL` | Watchdog + 5xx |

---

## Deploy

```bash
cd /home/call
git fetch origin && git reset --hard origin/main
bash scripts/deploy-call-devflix.sh
```

Nima qiladi:

1. Joriy image larni `:previous` deb saqlaydi (rollback)
2. Build + git SHA teg
3. Infra → MinIO init → app larni ketma-ket `--wait`
4. `prisma migrate deploy` (seed yo‘q)
5. Nginx conf + health tekshiruv

**CI:** GitHub Actions `.github/workflows/ci.yml` — typecheck/test `main` push/PR da.

---

## Rollback

```bash
bash scripts/rollback-prod.sh
```

`:previous` image lar oxirgi muvaffaqiyatli deploydan oldingi holatga qaytaradi.

---

## Backup / restore

**Cron (tavsiya):** `bash scripts/install-prod-cron.sh`  
- Kunlik 02:00 UTC: `backup-prod.sh` → `/home/call/backups/<stamp>/`  
- Har 5 daqiqa: `watchdog-health.sh`

**Backup tekshiruv (DB ni buzmasdan):**

```bash
bash scripts/verify-backup.sh
```

**Restore (DESTRUCTIVE):**

```bash
CONFIRM=YES bash scripts/restore-prod.sh /home/call/backups/20260728T020000Z
```

---

## Monitoring

| Signal | Qayerda |
|--------|---------|
| Health | `GET /api/v1/health` — DB+Redis; degraded → HTTP 503 |
| Watchdog | `scripts/watchdog-health.sh` + log `/home/call/logs/watchdog.log` |
| 5xx alert | `ALERT_WEBHOOK_URL` (Slack/Discord) — Nest exception filter |
| Docker logs | `json-file` max 50m × 5 |
| Konteyner | `restart: unless-stopped`, healthchecks |

Katta monitoring (Datadog/Grafana Cloud) — byudjetga bog‘liq; webhook + health yetarli MVP.

---

## Tezkor diagnostika

```bash
# Holat
docker compose -p aicc-call -f infra/docker-compose.prod.yml --env-file infra/.env.prod ps

# API log
docker logs aicc-call-api --tail 100

# Health
curl -sS https://call.devflix.uz/api/v1/health

# Disk
df -h /home/call

# Nginx
sudo nginx -t && sudo systemctl reload nginx
```

### Ko‘p uchraydigan muammolar

| Belgi | Sabab | Yechim |
|-------|-------|--------|
| API 503 | Postgres/Redis down | `docker ps`, health; konteynerni restart |
| Login 403 Origin | CSRF Origin | Brauzer Origin `https://call.devflix.uz` |
| Softfon audio yo‘q | RTP/NAT | `ss -uln \| grep 10000`, `ASTERISK_PUBLIC_IP`, firewall UDP |
| MinIO unhealthy | Image downgrade | `latest` dan eskiroq pin qilmang |
| Deploy tiqildi | minio-init `--wait` | Yangi deploy skript one-shot ni alohida kutadi |

---

## Xavfsizlik (prod minimum — allaqachon)

- HTTPS + HSTS, rate limit (login/API/WS), CSP/XFO/nosniff  
- Cookie-only refresh/access (prod), CSRF Origin  
- Redis `requirepass`, portlar `127.0.0.1`  
- Secrets gitda emas  

Chuqur security audit alohida tsikl.

---

## Skalalash eslatmasi

Bitta VPS: vertikal (CPU/RAM) + resource `deploy.limits`.  
Gorizontal: API/web stateless — load balancer orqasida N instance; Asterisk/RTP sticky/host network; Postgres/Redis alohida managed.
