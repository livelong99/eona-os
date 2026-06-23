"""Usage aggregation for the dashboard Control → Overview tab.

The ``sessions`` table in ``state.db`` already records per-session model, token
counts, cost, and ``api_call_count`` (written by the agent runtime).  This module
reads that durable data and rolls it up into the shapes the dashboard's
``control.ts`` mock constants define (``UsageStat[]`` / spend series /
``ModelUsage[]``).  No new tracking is introduced — this is a read-only view.

Design notes (mirrors the best-effort conventions of ``labs_store.py``):

- **Never raises.**  A query failure must never break ``GET /v1/usage``; every
  path returns a zeroed-but-valid view so the UI degrades to its mock fallback.
- **Read-only.**  Uses the caller-provided ``SessionDB``'s connection
  (``getattr(db, "_conn", None)``) exactly like ``tools/session_search_tool.py``;
  if absent, returns the empty view.
- **MTD windowing.**  Headline figures cover the current calendar month (UTC).
  Trend is last-7-days vs the prior-7-days for an honest, cheap delta.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Model id → display name + color.  Mirrors ``control.ts`` MODELS/MODEL_USAGE so
# the per-model breakdown renders with stable labels/colors.  Matched by
# substring (the stored ``model`` may be provider-prefixed or fully-qualified).
_MODEL_DISPLAY: tuple[tuple[str, str, str], ...] = (
    ("opus", "Opus 4.8", "#a78bfa"),
    ("sonnet", "Sonnet 4.6", "#4f8cff"),
    ("haiku", "Haiku 4.5", "#34d399"),
    ("fable", "Fable 5", "#f4c14d"),
)
_MODEL_FALLBACK_COLOR = "#8a8fa3"

# Default monthly budget used for the "of $X budget" sub-label when the caller
# supplies none.  Matches the mock so the gauge reads sensibly out of the box.
_DEFAULT_BUDGET_USD = 200.0

# Cost is recorded as actual when known, else estimated.
_COST_EXPR = "COALESCE(actual_cost_usd, estimated_cost_usd, 0)"


def _month_start_utc(now: float) -> float:
    """Unix ts for 00:00:00 UTC on the first of the current month."""
    dt = datetime.fromtimestamp(now, tz=timezone.utc)
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp()


def _fmt_money(amount: float) -> str:
    return f"${amount:,.2f}"


def _fmt_tokens(n: int) -> str:
    """Compact token count: 12.4M / 3.2K / 980."""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(int(n))


def _trend(curr: float, prev: float) -> int:
    """Percent change of *curr* vs *prev*, rounded and clamped to [-100, 999].

    Returns 0 when there's no prior-period baseline (avoids a misleading +∞ when
    activity simply started this week)."""
    if prev <= 0:
        return 0
    pct = int(round((curr - prev) / prev * 100))
    return max(-100, min(999, pct))


def _model_display(model_id: Optional[str]) -> tuple[str, str]:
    """Map a stored model id to (display_name, color)."""
    mid = (model_id or "").lower()
    for needle, name, color in _MODEL_DISPLAY:
        if needle in mid:
            return name, color
    return (model_id or "unknown"), _MODEL_FALLBACK_COLOR


def _empty_view(days: int, active_agents: int, budget_usd: float) -> Dict[str, Any]:
    """A valid, zeroed view (used on any error / missing connection)."""
    return {
        "stats": [
            {"label": "Spend (MTD)", "value": _fmt_money(0), "sub": f"of {_fmt_money(budget_usd)} budget", "trend": 0, "icon": "coins"},
            {"label": "Tokens", "value": "0", "sub": "in + out, this month", "trend": 0, "icon": "zap"},
            {"label": "Requests", "value": "0", "sub": "across all surfaces", "trend": 0, "icon": "activity"},
            {"label": "Active agents", "value": str(active_agents), "sub": "running right now", "trend": 0, "icon": "bot"},
        ],
        "spendSeries": [0] * days,
        "modelUsage": [],
    }


def build_usage_view(
    session_db: Any,
    *,
    days: int = 14,
    active_agents: int = 0,
    budget_usd: Optional[float] = None,
) -> Dict[str, Any]:
    """Roll the ``sessions`` table up into the Overview view.  Never raises.

    Returns ``{stats: UsageStat[], spendSeries: number[], modelUsage: ModelUsage[]}``
    mapping 1:1 onto the dashboard's ``control.ts`` types.
    """
    budget = budget_usd if budget_usd and budget_usd > 0 else _DEFAULT_BUDGET_USD
    conn = getattr(session_db, "_conn", None)
    if conn is None:
        return _empty_view(days, active_agents, budget)

    try:
        now = time.time()
        month_start = _month_start_utc(now)
        day = 86400.0
        last7_start = now - 7 * day
        prev7_start = now - 14 * day

        # ── Headline (MTD) ──────────────────────────────────────────────────
        row = conn.execute(
            f"SELECT {_COST_EXPR} AS cost, "
            "COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) AS toks, "
            "COALESCE(message_count, 0) AS reqs "
            "FROM sessions WHERE archived = 0 AND started_at >= ?",
            (month_start,),
        ).fetchall()
        spend = sum(float(r["cost"] or 0) for r in row)
        tokens = sum(int(r["toks"] or 0) for r in row)
        requests = sum(int(r["reqs"] or 0) for r in row)

        # ── Trend: last-7d vs prior-7d ──────────────────────────────────────
        def _window(lo: float, hi: float) -> tuple[float, int, int]:
            rows = conn.execute(
                f"SELECT {_COST_EXPR} AS cost, "
                "COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) AS toks, "
                "COALESCE(message_count, 0) AS reqs "
                "FROM sessions WHERE archived = 0 AND started_at >= ? AND started_at < ?",
                (lo, hi),
            ).fetchall()
            return (
                sum(float(r["cost"] or 0) for r in rows),
                sum(int(r["toks"] or 0) for r in rows),
                sum(int(r["reqs"] or 0) for r in rows),
            )

        c_spend, c_tok, c_req = _window(last7_start, now)
        p_spend, p_tok, p_req = _window(prev7_start, last7_start)

        # ── 14-day spend series (oldest → newest, zero-filled) ──────────────
        series_start = now - days * day
        buckets = [0.0] * days
        srows = conn.execute(
            f"SELECT started_at AS ts, {_COST_EXPR} AS cost "
            "FROM sessions WHERE archived = 0 AND started_at >= ?",
            (series_start,),
        ).fetchall()
        for r in srows:
            ts = float(r["ts"] or 0)
            idx = int((ts - series_start) // day)
            if 0 <= idx < days:
                buckets[idx] += float(r["cost"] or 0)
        spend_series = [round(b, 2) for b in buckets]

        # ── Per-model breakdown (MTD), share by cost ────────────────────────
        mrows = conn.execute(
            f"SELECT model, {_COST_EXPR} AS cost "
            "FROM sessions WHERE archived = 0 AND started_at >= ?",
            (month_start,),
        ).fetchall()
        by_model: Dict[str, float] = {}
        for r in mrows:
            name, _ = _model_display(r["model"])
            by_model[name] = by_model.get(name, 0.0) + float(r["cost"] or 0)
        total_cost = sum(by_model.values())
        model_usage: List[Dict[str, Any]] = []
        # Stable order: by cost descending.
        for name, cost in sorted(by_model.items(), key=lambda kv: kv[1], reverse=True):
            # Recover a color for the display name.
            color = _MODEL_FALLBACK_COLOR
            for _, dname, dcolor in _MODEL_DISPLAY:
                if dname == name:
                    color = dcolor
                    break
            share = round(cost / total_cost * 100) if total_cost > 0 else 0
            model_usage.append({"name": name, "share": share, "color": color, "cost": _fmt_money(cost)})

        stats = [
            {"label": "Spend (MTD)", "value": _fmt_money(spend), "sub": f"of {_fmt_money(budget)} budget", "trend": _trend(c_spend, p_spend), "icon": "coins"},
            {"label": "Tokens", "value": _fmt_tokens(tokens), "sub": "in + out, this month", "trend": _trend(c_tok, p_tok), "icon": "zap"},
            {"label": "Requests", "value": f"{requests:,}", "sub": "across all surfaces", "trend": _trend(c_req, p_req), "icon": "activity"},
            {"label": "Active agents", "value": str(active_agents), "sub": "running right now", "trend": 0, "icon": "bot"},
        ]
        return {"stats": stats, "spendSeries": spend_series, "modelUsage": model_usage}
    except Exception as exc:  # pragma: no cover — best-effort, never break the route
        logger.warning("usage_aggregate.build_usage_view failed: %s", exc)
        return _empty_view(days, active_agents, budget)
