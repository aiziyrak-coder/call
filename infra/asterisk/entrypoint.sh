#!/bin/bash
set -euo pipefail

KEYS_DIR=/etc/asterisk/keys
RUN_DIR=/var/run/asterisk

# Konfiguratsiya fayllari Windows hostdan volume orqali keladi. Asterisk `#include`
# va ba'zi qiymatlarda satr oxiridagi \r ni qiymat qismi deb qabul qiladi.
for conf in /etc/asterisk/*.conf; do
  [ -f "$conf" ] && sed -i 's/\r$//' "$conf"
done

mkdir -p "$RUN_DIR" "$KEYS_DIR"
chmod 700 "$RUN_DIR"

# Brauzerdagi WebRTC (WSS + DTLS-SRTP) uchun sertifikat majburiy.
if [ ! -f "$KEYS_DIR/asterisk.pem" ]; then
  echo "[aicc] WebRTC uchun self-signed sertifikat yaratilmoqda..."
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout "$KEYS_DIR/asterisk.key" \
    -out "$KEYS_DIR/asterisk.crt" \
    -subj "/C=UZ/ST=Tashkent/L=Tashkent/O=AiCC/CN=${ASTERISK_SIP_DOMAIN:-aicc.local}" \
    -addext "subjectAltName=DNS:${ASTERISK_SIP_DOMAIN:-aicc.local},DNS:localhost,IP:127.0.0.1"
  cat "$KEYS_DIR/asterisk.key" "$KEYS_DIR/asterisk.crt" > "$KEYS_DIR/asterisk.pem"
  chmod 600 "$KEYS_DIR/asterisk.key" "$KEYS_DIR/asterisk.pem"
fi

# ARI paroli faqat runtime faylga — bind-mount / git ga tushmaydi.
ARI_USER_SAFE="${ARI_USER:-aicc}"
ARI_PASS_SAFE="${ARI_PASSWORD:-}"
if [ -z "$ARI_PASS_SAFE" ] || [ "$ARI_PASS_SAFE" = "aicc_ari_password" ] || [ "$ARI_PASS_SAFE" = "CHANGE_ME_ARI_PASSWORD" ]; then
  if [ "${NODE_ENV:-}" = "production" ] || [ -n "${ARI_REQUIRE_STRONG:-}" ]; then
    echo "[aicc] ARI_PASSWORD kuchli va noyob bo'lishi shart" >&2
    exit 1
  fi
  ARI_PASS_SAFE="${ARI_PASSWORD:-aicc_ari_password}"
fi
cat > "$RUN_DIR/ari_auth.conf" <<EOF
[${ARI_USER_SAFE}]
type = user
read_only = no
password = ${ARI_PASS_SAFE}
password_format = plain
EOF
chmod 600 "$RUN_DIR/ari_auth.conf"

# GSM gateway paroli (agar berilgan bo'lsa)
if [ -n "${GSM_GATEWAY_PASSWORD:-}" ] && [ -f /etc/asterisk/pjsip.conf ]; then
  sed -i "s|password = __GSM_GATEWAY_PASSWORD__|password = ${GSM_GATEWAY_PASSWORD}|" /etc/asterisk/pjsip.conf || true
fi

# NAT ortida WebRTC: tashqi IP (RTP candidate)
if [ -n "${ASTERISK_PUBLIC_IP:-}" ]; then
  if ! grep -q '^externaddr' /etc/asterisk/rtp.conf 2>/dev/null; then
    printf '\nexternaddr = %s\nlocalnet = 10.0.0.0/8\nlocalnet = 172.16.0.0/12\nlocalnet = 192.168.0.0/16\n' \
      "$ASTERISK_PUBLIC_IP" >> /etc/asterisk/rtp.conf
  else
    sed -i "s|^externaddr *=.*|externaddr = ${ASTERISK_PUBLIC_IP}|" /etc/asterisk/rtp.conf || true
  fi
  # WSS transport uchun tashqi media/signaling
  if grep -q '\[transport-wss\]' /etc/asterisk/pjsip.conf; then
    if ! grep -q 'external_media_address' /etc/asterisk/pjsip.conf; then
      sed -i "/\[transport-wss\]/,/^\[/{s|^bind = 0.0.0.0:8089|bind = 0.0.0.0:8089\nexternal_media_address = ${ASTERISK_PUBLIC_IP}\nexternal_signaling_address = ${ASTERISK_PUBLIC_IP}|}" \
        /etc/asterisk/pjsip.conf || true
    fi
  fi
fi

# Dev extras (faqat fayl mavjud bo'lsa — lokal compose)
if [ -f /etc/asterisk/pjsip_dev_extras.conf ] && [ "${ASTERISK_ENABLE_DEV_EXTRAS:-0}" = "1" ]; then
  if ! grep -q 'pjsip_dev_extras.conf' /etc/asterisk/pjsip.conf; then
    echo '#include pjsip_dev_extras.conf' >> /etc/asterisk/pjsip.conf
  fi
fi

chown -R asterisk:asterisk /etc/asterisk /var/spool/asterisk /var/log/asterisk "$RUN_DIR" 2>/dev/null || true

echo "[aicc] Asterisk ishga tushmoqda..."
exec "$@"
