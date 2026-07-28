# GigaAM v3 asosidagi rus tili uchun real-time STT serveri.
# Rasmiy image mavjud bo'lmagani uchun manbadan yig'iladi.
# CUDA kerak bo'lsa: --build-arg FEATURES=cuda va nvidia runtime ni yoqing.
FROM rust:1.85-slim AS builder

ARG FEATURES=""
ARG GIGASTT_REF=main

RUN apt-get update && apt-get install -y --no-install-recommends \
    git pkg-config libssl-dev cmake build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --depth 1 --branch ${GIGASTT_REF} https://github.com/ekhodzitsky/gigastt.git .

RUN if [ -n "$FEATURES" ]; then \
      cargo build --release --features "$FEATURES"; \
    else \
      cargo build --release; \
    fi

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /src/target/release/gigastt /usr/local/bin/gigastt

ENV GIGASTT_HOST=0.0.0.0 \
    GIGASTT_PORT=9876 \
    GIGASTT_MODEL_DIR=/models

VOLUME ["/models"]
EXPOSE 9876

CMD ["gigastt", "serve"]
