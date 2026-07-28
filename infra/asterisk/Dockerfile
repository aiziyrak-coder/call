FROM andrius/asterisk:22

# Konfiguratsiya konteynerga volume orqali ulanadi (docker-compose.yml ga qarang).
# Bu yerda faqat runtime kataloglari va sertifikat generatori tayyorlanadi.

USER root

RUN apk add --no-cache openssl bash 2>/dev/null || \
    (apt-get update && apt-get install -y --no-install-recommends openssl bash ca-certificates && rm -rf /var/lib/apt/lists/*)

RUN mkdir -p /var/spool/asterisk/monitor /etc/asterisk/keys /var/log/asterisk

COPY entrypoint.sh /usr/local/bin/aicc-entrypoint.sh
# Windows hostda checkout qilinganda fayl CRLF bilan keladi va shebang buziladi.
RUN sed -i 's/\r$//' /usr/local/bin/aicc-entrypoint.sh && \
    chmod +x /usr/local/bin/aicc-entrypoint.sh

EXPOSE 5060/udp 5060/tcp 8088/tcp 8089/tcp 10000-10100/udp

ENTRYPOINT ["/usr/local/bin/aicc-entrypoint.sh"]
CMD ["asterisk", "-f", "-vvv"]
