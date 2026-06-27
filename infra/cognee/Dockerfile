# Cognee image + the fastembed extra (the base cognee/cognee image ships without
# it, but we use a LOCAL fastembed embedder — see ~/.hermes/cognee.env). Keeps the
# embedding model local/free instead of falling back to a paid OpenAI default.
FROM cognee/cognee:latest
# cognee runs from /app/.venv, a stripped uv-built venv with NO pip/uv of its own —
# the default `pip` hits the system python the venv can't see. Bootstrap pip into the
# venv with ensurepip, then install fastembed there so it resolves against the venv's
# existing deps (numpy/huggingface-hub/etc.) instead of duplicating them.
RUN /app/.venv/bin/python -m ensurepip --upgrade \
 && /app/.venv/bin/python -m pip install --no-cache-dir fastembed
