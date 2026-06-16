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

# Initialize the Kanban board then start the gateway (binds 0.0.0.0 inside the
# container; host exposure is controlled by the compose 127.0.0.1 publish).
CMD ["bash", "-lc", "hermes kanban init || true; hermes gateway start --host 0.0.0.0 --port 8642"]
