"""Brain context injection adapter for the run-conversation hot path.

Wires ``Brain.retrieve()`` into the per-turn user-message injection block so
that the agent has relevant vault context before each model call.

Activation
----------
Set the environment variable ``HERMES_BRAIN_INJECT=1`` (or ``true``/``yes``) to
enable.  Can also be enabled via ``brain.inject: true`` in ``config.yaml``.
Default is **off** — the flag must be explicitly set to change behaviour.

Fail-safe contract
------------------
``get_brain_context`` NEVER raises.  Any error (import failure, Qdrant
unavailable, holographic DB missing, timeout) is caught and logged at DEBUG
level; the function returns an empty string so the caller's injection list
gains nothing and the turn proceeds normally.  The hot path is never broken
by a Brain outage.

Callers
-------
``engine/agent/conversation_loop.py`` — called once per turn (not once per
loop iteration) because ``user_message`` is fixed for the lifetime of a turn.
Retrieved context is injected as a USER-message block, never into the system
prompt (cache discipline §5.4).
"""

from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# Fenced-block wrapper keeps the injected context visually distinct from the
# user's own message and easy to strip in post-processing if needed.
_CONTEXT_FENCE_OPEN = "<brain-context>"
_CONTEXT_FENCE_CLOSE = "</brain-context>"

# Conservative default: retrieve only a small window to limit latency impact.
_DEFAULT_K = 5


def _flag_enabled() -> bool:
    """Return True when brain injection is enabled via env var.

    ``HERMES_BRAIN_INJECT=1|true|yes`` → enabled.
    ``HERMES_BRAIN_INJECT=0|false|no``  → disabled.
    Anything else (including unset)     → disabled (default-conservative).

    Config.yaml brain.inject is intentionally NOT read here — conversation_loop
    does not have _cfg in scope, and the env var is the single reliable signal
    on the hot path.  Operators who want per-deploy control should set the env
    var at the process boundary.
    """
    val = os.environ.get("HERMES_BRAIN_INJECT", "").strip().lower()
    return val in ("1", "true", "yes")


def _format_brain_result(result) -> str:
    """Render a ``BrainResult`` into a compact injection string.

    Only non-empty lanes are rendered.  Each fact contributes its content
    plus a short provenance label.  Total output is capped to stay within
    reasonable token limits.
    """
    parts: list[str] = []

    def _add_lane(facts, label: str, max_facts: int = 3) -> None:
        items = [f for f in (facts or []) if f.content]
        if not items:
            return
        parts.append(f"[{label}]")
        for fact in items[:max_facts]:
            src = f" ({fact.source})" if fact.source else ""
            parts.append(f"- {fact.content[:400].strip()}{src}")

    _add_lane(result.similar,    "similar",    max_facts=3)
    _add_lane(result.temporal,   "temporal",   max_facts=2)
    _add_lane(result.strategies, "strategies", max_facts=2)
    _add_lane(result.preferences,"preferences",max_facts=1)

    return "\n".join(parts)


def get_brain_context(user_message: str) -> str:
    """Retrieve relevant vault context for ``user_message`` and return as a
    fenced string ready for injection into the current turn's user message.

    Returns an empty string when:
    - the feature flag is off (default),
    - Brain import fails (holographic / Qdrant not installed),
    - ``Brain.retrieve()`` raises for any reason,
    - the retrieval result has no usable content.

    Never raises.
    """
    try:
        if not _flag_enabled():
            return ""

        try:
            # Lazy import — only pays the import cost when the flag is on.
            try:
                from engine.agent.brain import Brain
            except ImportError:
                from agent.brain import Brain  # type: ignore[no-redef]

            brain = Brain()
            result = brain.retrieve(user_message, k=_DEFAULT_K)
        except Exception as exc:
            logger.debug("brain_inject: retrieve failed (fail-open): %s", exc)
            return ""

        try:
            body = _format_brain_result(result)
        except Exception as exc:
            logger.debug("brain_inject: format failed (fail-open): %s", exc)
            return ""

        if not body.strip():
            return ""

        return f"{_CONTEXT_FENCE_OPEN}\n{body}\n{_CONTEXT_FENCE_CLOSE}"
    except Exception as exc:
        logger.debug("brain_inject: unexpected error (fail-open): %s", exc)
        return ""
