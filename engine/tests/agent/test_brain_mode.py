"""Tests for the Cognee dual-brain Part 1 additions to ``agent/brain.py``.

Covers the three invariants of the change:

1. **Mode resolution** — ``_brain_mode()`` reads ``HERMES_BRAIN_MODE``, validates
   against ("obsidian","cognee","unified"), and falls back to "obsidian" on
   unset/garbage (boundary validation).
2. **Fail-open Cognee lane** — ``_cognee_recall`` / ``_similar_via_cognee`` return
   ``[]`` on any failure (no service, exception) and never raise.
3. **Mode-gated lane selection** — ``retrieve().similar`` is assembled from the
   holographic+Qdrant lanes in obsidian mode (byte-for-byte unchanged), the Cognee
   lane only in cognee mode, and all three fused in unified mode — via the existing
   ``_merge_dedupe``. ``BrainFact``/``BrainResult`` signatures are untouched.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from agent.brain import (
    Brain,
    BrainFact,
    _brain_mode,
    _cognee_recall,
    _merge_dedupe,
)


def _fact(content: str, score: float, source: str = "n.md") -> BrainFact:
    return BrainFact(content=content, score=score, provenance="vault", source=source)


# ---------------------------------------------------------------------------
# 1. Mode resolution
# ---------------------------------------------------------------------------

class TestBrainMode:
    def test_unset_defaults_to_obsidian(self, monkeypatch):
        monkeypatch.delenv("HERMES_BRAIN_MODE", raising=False)
        assert _brain_mode() == "obsidian"

    @pytest.mark.parametrize("value", ["obsidian", "cognee", "unified"])
    def test_valid_values_pass_through(self, monkeypatch, value):
        monkeypatch.setenv("HERMES_BRAIN_MODE", value)
        assert _brain_mode() == value

    @pytest.mark.parametrize("raw,expected", [
        ("UNIFIED", "unified"),
        ("  Cognee  ", "cognee"),
        ("OBSIDIAN", "obsidian"),
    ])
    def test_case_and_whitespace_normalized(self, monkeypatch, raw, expected):
        monkeypatch.setenv("HERMES_BRAIN_MODE", raw)
        assert _brain_mode() == expected

    @pytest.mark.parametrize("garbage", ["", "garbage", "qdrant", "both", "  "])
    def test_garbage_falls_back_to_obsidian(self, monkeypatch, garbage):
        monkeypatch.setenv("HERMES_BRAIN_MODE", garbage)
        assert _brain_mode() == "obsidian"


# ---------------------------------------------------------------------------
# 2. Fail-open Cognee lane
# ---------------------------------------------------------------------------

class TestCogneeLaneFailOpen:
    def test_recall_no_service_returns_empty(self):
        # No Cognee listening on the default URL → [] (connection refused),
        # and it must not raise.
        assert _cognee_recall("anything", 5) == []

    def test_recall_swallows_exceptions(self):
        with patch("urllib.request.urlopen", side_effect=OSError("boom")):
            assert _cognee_recall("q", 3) == []

    def test_lane_no_service_returns_empty(self):
        assert Brain()._similar_via_cognee("q", k=5) == []

    def test_lane_maps_hits_to_brainfacts(self):
        hits = [
            {"text": "alpha fact", "score": 0.9, "source_path": "10_Projects/a.md",
             "entity": "Alpha", "relations": [{"to": "Beta"}]},
            {"description": "beta desc", "score": 0.5, "entity": "Beta"},
            {"entity": "NoText", "score": 0.3},          # dropped: no text/description
            "not-a-dict",                                  # dropped: malformed
        ]
        with patch("agent.brain._cognee_recall", return_value=hits):
            facts = Brain()._similar_via_cognee("q", k=10)
        assert [f.content for f in facts] == ["alpha fact", "beta desc"]
        assert all(f.provenance == "vault" for f in facts)
        assert facts[0].source == "10_Projects/a.md"
        assert facts[0].metadata["cognee_entity"] == "Alpha"
        assert facts[1].source == "Beta"          # falls back to entity

    def test_lane_tolerates_malformed_score(self):
        with patch("agent.brain._cognee_recall",
                   return_value=[{"text": "x", "score": None}]):
            facts = Brain()._similar_via_cognee("q", k=5)
        assert facts[0].score == 0.0


# ---------------------------------------------------------------------------
# 3. Mode-gated lane selection in retrieve()
# ---------------------------------------------------------------------------

class TestRetrieveLaneGating:
    """Patch each similarity lane with a marker so we can observe selection.

    The temporal/strategy/preference lanes return [] (no vault dirs in the
    hermetic env) and are unaffected by mode.
    """

    HOLO = [_fact("holo", 0.8)]
    QDRANT = [_fact("qdrant", 0.7)]
    COGNEE = [_fact("cognee", 0.6)]

    def _brain(self):
        brain = Brain()
        brain._similar_via_holographic = lambda q, *, k, min_trust: list(self.HOLO)
        brain._similar_via_qdrant = lambda q, *, k: list(self.QDRANT)
        brain._similar_via_cognee = lambda q, *, k: list(self.COGNEE)
        return brain

    def test_obsidian_uses_vault_lanes_only(self, monkeypatch):
        monkeypatch.delenv("HERMES_BRAIN_MODE", raising=False)
        contents = {f.content for f in self._brain().retrieve("q").similar}
        assert contents == {"holo", "qdrant"}
        assert "cognee" not in contents

    def test_cognee_uses_cognee_lane_only(self, monkeypatch):
        monkeypatch.setenv("HERMES_BRAIN_MODE", "cognee")
        contents = {f.content for f in self._brain().retrieve("q").similar}
        assert contents == {"cognee"}

    def test_unified_fuses_all_three(self, monkeypatch):
        monkeypatch.setenv("HERMES_BRAIN_MODE", "unified")
        contents = {f.content for f in self._brain().retrieve("q").similar}
        assert contents == {"holo", "qdrant", "cognee"}

    def test_obsidian_never_calls_cognee_lane(self, monkeypatch):
        monkeypatch.delenv("HERMES_BRAIN_MODE", raising=False)
        brain = self._brain()
        with patch.object(brain, "_similar_via_cognee") as cognee_lane:
            cognee_lane.return_value = []
            brain.retrieve("q")
        cognee_lane.assert_not_called()

    def test_obsidian_output_equals_pre_change_assembly(self, monkeypatch):
        """Prove obsidian mode is byte-for-byte today's behavior: the assembled
        ``similar`` equals ``_merge_dedupe(holographic + qdrant, k)`` directly."""
        monkeypatch.delenv("HERMES_BRAIN_MODE", raising=False)
        brain = self._brain()
        got = brain.retrieve("q", k=10).similar
        expected = _merge_dedupe(list(self.HOLO) + list(self.QDRANT), k=10)
        assert got == expected
