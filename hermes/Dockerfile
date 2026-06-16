# Hermes Agent (free, MIT) built from the official installer.
# NOTE: verify the install URL + entrypoint against current Hermes docs; the
# project moves fast. If Nous publishes an official image, prefer that instead.
FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     curl ca-certificates git ripgrep ffmpeg nodejs npm \
  && rm -rf /var/lib/apt/lists/*

# Install Hermes Agent (provisions uv, etc. per the installer).
RUN curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash \
  && ln -sf "$(command -v hermes || echo /root/.local/bin/hermes)" /usr/local/bin/hermes || true

ENV PATH="/root/.local/bin:${PATH}"
WORKDIR /root

EXPOSE 8642

# Init the Kanban board, then run the gateway in the FOREGROUND (recommended for
# Docker). The gateway hosts the OpenAI-compatible API server on :8642. Host bind
# comes from API_SERVER_HOST (0.0.0.0 in-container); host exposure is the compose
# 127.0.0.1 publish.
CMD ["bash", "-lc", "hermes kanban init || true; hermes gateway run"]
