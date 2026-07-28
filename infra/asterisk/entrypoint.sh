#!/bin/bash
set -euo pipefail

KEYS_DIR=/etc/asterisk/keys

# Konfiguratsiya fayllari Windows hostdan volume orqali keladi. Asterisk `#include`
# va ba'zi qiymatlarda satr oxiridagi \r ni qiymat qismi deb qabul qiladi.
for conf in /etc/asterisk/*.conf; do
  [ -f "$conf" ] && sed -i 's/\r$//' "$conf"
done

# Brauzerdagi WebRTC (WSS + DTLS-SRTP) uchun sertifikat majburiy.
# Ishlab chiqarishda haqiqiy sertifikat ulanadi; dev uchun o'z-o'zidan imzolangani yaratiladi.
if [ ! -f "$KEYS_DIR/asterisk.pem" ]; then
  echo "[aicc] WebRTC uchun self-signed sertifikat yaratilmoqda..."
  mkdir -p "$KEYS_DIR"
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout "$KEYS_DIR/asterisk.key" \
    -out "$KEYS_DIR/asterisk.crt" \
    -subj "/C=UZ/ST=Tashkent/L=Tashkent/O=AiCC/CN=${ASTERISK_SIP_DOMAIN:-aicc.local}" \
    -addext "subjectAltName=DNS:${ASTERISK_SIP_DOMAIN:-aicc.local},DNS:localhost,IP:127.0.0.1"
  cat "$KEYS_DIR/asterisk.key" "$KEYS_DIR/asterisk.crt" > "$KEYS_DIR/asterisk.pem"
  chmod 600 "$KEYS_DIR/asterisk.key" "$KEYS_DIR/asterisk.pem"
fi

# ARI hisob ma'lumotlari muhit o'zgaruvchilaridan olinadi.
if [ -f /etc/asterisk/ari.conf ]; then
  sed -i "s|^\[aicc\]|[${ARI_USER:-aicc}]|" /etc/asterisk/ari.conf || true
  sed -i "s|^password = .*|password = ${ARI_PASSWORD:-aicc_ari_password}|" /etc/asterisk/ari.conf || true
fi

chown -R asterisk:asterisk /etc/asterisk /var/spool/asterisk /var/log/asterisk 2>/dev/null || true

echo "[aicc] Asterisk ishga tushmoqda..."
exec "$@"
