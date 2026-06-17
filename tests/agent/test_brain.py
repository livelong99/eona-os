"""Tests for engine/agent/brain.py (Brain L0) and brain_timewalk.py.

Run with:
    pytest tests/agent/test_brain.py -v

The tests are fully isolated — each gets a tmp_path vault + SQLite store and
never touch the real vault or Qdrant.  Network calls (Gemini embed, Qdrant) are
implicitly absent (no API key / no server) so those lanes return [] and the
graceful-degradation path is exercised automatically.
"""
from __future__ import annotations

import sqlite3
from datetime import date
from pathlib import Path

import pytest

# ── Import helpers ────────────────────────────────────────────────────────────

def _make_brain(tmp_path: Path):
    """Return a Brain instance wired to a tmp vault + tmp SQLite db."""
    import sys
    # Make sure engine/ root is importable when running from project root
    project_root = Path(__file__).parent.parent.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

    from engine.agent.brain import Brain
    return Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")


def _seed_holographic_db(db_path: Path) -> None:
    """Seed a minimal SQLite brain store with one fact so search returns data."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    # Minimal schema matching holographic/store.py
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS facts (
            fact_id         INTEGER PRIMARY KEY AUTOINCREMENT,
            content         TEXT NOT NULL UNIQUE,
            category        TEXT DEFAULT 'general',
            tags            TEXT DEFAULT '',
            trust_score     REAL DEFAULT 0.5,
            retrieval_count INTEGER DEFAULT 0,
            helpful_count   INTEGER DEFAULT 0,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            hrr_vector      BLOB
        );
        CREATE TABLE IF NOT EXISTS entities (
            entity_id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            entity_type TEXT DEFAULT 'unknown',
            aliases     TEXT DEFAULT '',
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS fact_entities (
            fact_id   INTEGER REFERENCES facts(fact_id),
            entity_id INTEGER REFERENCES entities(entity_id),
            PRIMARY KEY (fact_id, entity_id)
        );
        CREATE INDEX IF NOT EXISTS idx_facts_trust    ON facts(trust_score DESC);
        CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
        CREATE INDEX IF NOT EXISTS idx_entities_name  ON entities(name);
        CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts
            USING fts5(content, tags, content=facts, content_rowid=fact_id);
        CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
            INSERT INTO facts_fts(rowid, content, tags)
                VALUES (new.fact_id, new.content, new.tags);
        END;
        CREATE TABLE IF NOT EXISTS memory_banks (
            bank_id    INTEGER PRIMARY KEY AUTOINCREMENT,
            bank_name  TEXT NOT NULL UNIQUE,
            vector     BLOB NOT NULL,
            dim        INTEGER NOT NULL,
            fact_count INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.execute(
        "INSERT OR IGNORE INTO facts (content, category, tags, trust_score) VALUES (?, ?, ?, ?)",
        ("The agent-home system uses a PARA vault for temporal memory.", "general", "brain vault", 0.9),
    )
    conn.commit()
    conn.close()


# ── brain_timewalk tests ──────────────────────────────────────────────────────

class TestTimewalk:
    def test_returns_empty_for_nonexistent_vault(self, tmp_path: Path) -> None:
        from engine.agent.brain_timewalk import walk_dated_notes
        results = walk_dated_notes(vault_dir=tmp_path / "does_not_exist")
        assert results == []

    def test_includes_notes_on_or_before_as_of(self, tmp_path: Path) -> None:
        from engine.agent.brain_timewalk import walk_dated_notes
        (tmp_path / "2026-01-10-note.md").write_text(
            "---\ncreated: 2026-01-10\n---\nOld note content"
        )
        (tmp_path / "2026-06-01-note.md").write_text(
            "---\ncreated: 2026-06-01\n---\nOn-boundary note"
        )
        results = walk_dated_notes(as_of="2026-06-01", vault_dir=tmp_path)
        dates = [r[0] for r in results]
        assert "2026-01-10" in dates
        assert "2026-06-01" in dates

    def test_excludes_future_notes(self, tmp_path: Path) -> None:
        from engine.agent.brain_timewalk import walk_dated_notes
        (tmp_path / "2099-01-01-future.md").write_text("Future note")
        results = walk_dated_notes(as_of="2026-06-18", vault_dir=tmp_path)
        assert all(r[0] <= "2026-06-18" for r in results)

    def test_most_recent_first(self, tmp_path: Path) -> None:
        from engine.agent.brain_timewalk import walk_dated_notes
        (tmp_path / "2026-01-01-a.md").write_text("---\ncreated: 2026-01-01\n---\nA")
        (tmp_path / "2026-03-15-b.md").write_text("---\ncreated: 2026-03-15\n---\nB")
        (tmp_path / "2026-02-20-c.md").write_text("---\ncreated: 2026-02-20\n---\nC")
        results = walk_dated_notes(as_of="2026-06-18", vault_dir=tmp_path)
        dates = [r[0] for r in results]
        assert dates == sorted(dates, reverse=True)

    def test_snippet_strips_frontmatter(self, tmp_path: Path) -> None:
        from engine.agent.brain_timewalk import walk_dated_notes
        (tmp_path / "2026-04-01-strip.md").write_text(
            "---\ntitle: Test\ncreated: 2026-04-01\n---\nThe real body content here."
        )
        results = walk_dated_notes(as_of="2026-06-18", vault_dir=tmp_path)
        assert len(results) == 1
        snippet = results[0][2]
        assert "created:" not in snippet
        assert "The real body content here." in snippet

    def test_date_from_filename_when_no_frontmatter(self, tmp_path: Path) -> None:
        from engine.agent.brain_timewalk import walk_dated_notes
        (tmp_path / "2026-05-10-no-fm.md").write_text("No frontmatter here.")
        results = walk_dated_notes(as_of="2026-06-18", vault_dir=tmp_path)
        dates = [r[0] for r in results]
        assert "2026-05-10" in dates

    def test_limit_respected(self, tmp_path: Path) -> None:
        from engine.agent.brain_timewalk import walk_dated_notes
        for i in range(1, 20):
            (tmp_path / f"2026-0{i // 10 + 1}-{i:02d}-note.md").write_text(
                f"---\ncreated: 2026-0{i // 10 + 1}-{i:02d}\n---\nNote {i}"
            )
        results = walk_dated_notes(as_of="2026-12-31", vault_dir=tmp_path, limit=5)
        assert len(results) <= 5


# ── Brain.retrieve tests ──────────────────────────────────────────────────────

class TestBrainRetrieve:
    def test_returns_brain_result(self, tmp_path: Path) -> None:
        from engine.agent.brain import Brain, BrainResult
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        result = brain.retrieve("agent memory")
        assert isinstance(result, BrainResult)

    def test_result_fields_are_lists(self, tmp_path: Path) -> None:
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        result = brain.retrieve("test query")
        assert isinstance(result.similar, list)
        assert isinstance(result.temporal, list)
        assert isinstance(result.strategies, list)
        assert isinstance(result.preferences, list)

    def test_as_of_is_propagated(self, tmp_path: Path) -> None:
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        result = brain.retrieve("query", as_of="2026-01-01")
        assert result.as_of == "2026-01-01"

    def test_as_of_none_by_default(self, tmp_path: Path) -> None:
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        result = brain.retrieve("query")
        assert result.as_of is None

    def test_temporal_lane_populated_from_vault(self, tmp_path: Path) -> None:
        """Notes in the vault appear in the temporal lane."""
        (tmp_path / "2026-03-01-decision.md").write_text(
            "---\ncreated: 2026-03-01\n---\nDecided to use PARA vault."
        )
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        result = brain.retrieve("decision", as_of="2026-06-18")
        assert len(result.temporal) >= 1
        contents = [f.content for f in result.temporal]
        assert any("PARA vault" in c for c in contents)

    def test_strategies_populated_after_append(self, tmp_path: Path) -> None:
        """Appended reasoningbank record appears in strategies lane."""
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        brain.append("reasoningbank", "Always validate input at system boundaries.")
        result = brain.retrieve("validation strategy")
        assert len(result.strategies) >= 1
        contents = [f.content for f in result.strategies]
        assert any("validate" in c for c in contents)

    def test_preferences_populated_after_append(self, tmp_path: Path) -> None:
        """Appended preference-spine record appears in preferences lane."""
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        brain.append("preference-spine", "User prefers concise bullet responses.")
        result = brain.retrieve("style preference")
        assert len(result.preferences) >= 1
        contents = [f.content for f in result.preferences]
        assert any("concise" in c for c in contents)

    def test_graceful_degradation_no_qdrant(self, tmp_path: Path) -> None:
        """retrieve() does not raise even when Qdrant is unreachable."""
        import os
        old = os.environ.get("QDRANT_URL")
        os.environ["QDRANT_URL"] = "http://127.0.0.1:19999"  # nothing listening
        try:
            from engine.agent.brain import Brain
            brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
            result = brain.retrieve("test")  # must not raise
            assert result is not None
        finally:
            if old is None:
                os.environ.pop("QDRANT_URL", None)
            else:
                os.environ["QDRANT_URL"] = old

    def test_holographic_lane_with_seeded_db(self, tmp_path: Path) -> None:
        """With a seeded SQLite store, the similarity lane returns facts."""
        db_path = tmp_path / "brain.db"
        _seed_holographic_db(db_path)
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=db_path)
        result = brain.retrieve("PARA vault temporal memory", k=5)
        # The seeded fact should surface in the similar lane
        assert len(result.similar) >= 1
        assert any("PARA vault" in f.content for f in result.similar)


# ── Brain.append tests ────────────────────────────────────────────────────────

class TestBrainAppend:
    def test_returns_string_id(self, tmp_path: Path) -> None:
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        record_id = brain.append("reasoningbank", "Strategy: prefer immutability.")
        assert isinstance(record_id, str)
        assert len(record_id) == 36  # UUID4

    def test_creates_file_in_namespace_dir(self, tmp_path: Path) -> None:
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        brain.append("reasoningbank", "Strategy content here.")
        ns_dir = tmp_path / "20_Areas/agent-os/brain/reasoningbank"
        assert ns_dir.exists()
        files = list(ns_dir.glob("*.md"))
        assert len(files) == 1

    def test_file_has_obsidian_frontmatter(self, tmp_path: Path) -> None:
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        brain.append("preference-spine", "User likes terse answers.", provenance="derived")
        ns_dir = tmp_path / "20_Areas/agent-os/brain/preference-spine"
        file_content = next(ns_dir.glob("*.md")).read_text()
        assert "---" in file_content
        assert "created:" in file_content
        assert "provenance: derived" in file_content
        assert "tags:" in file_content

    def test_file_is_dated(self, tmp_path: Path) -> None:
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        brain.append("reasoningbank", "Test content.")
        ns_dir = tmp_path / "20_Areas/agent-os/brain/reasoningbank"
        filename = next(ns_dir.glob("*.md")).name
        today = date.today().isoformat()
        assert filename.startswith(today), f"Expected {today}-..., got {filename}"

    def test_append_is_immutable_new_files_only(self, tmp_path: Path) -> None:
        """Each append call creates a NEW file — existing files are never modified."""
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        brain.append("reasoningbank", "First record.")
        ns_dir = tmp_path / "20_Areas/agent-os/brain/reasoningbank"
        mtime_before = next(ns_dir.glob("*.md")).stat().st_mtime

        brain.append("reasoningbank", "Second record.")
        files = list(ns_dir.glob("*.md"))
        assert len(files) == 2  # two separate files
        # Original file's mtime must not have changed
        original_mtime = next(f for f in files if f.stat().st_mtime == mtime_before).stat().st_mtime
        assert original_mtime == mtime_before

    def test_content_in_file_body(self, tmp_path: Path) -> None:
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        content = "This is the strategy body with unique content 12345."
        brain.append("reasoningbank", content)
        ns_dir = tmp_path / "20_Areas/agent-os/brain/reasoningbank"
        file_text = next(ns_dir.glob("*.md")).read_text()
        assert content in file_text

    def test_metadata_in_frontmatter(self, tmp_path: Path) -> None:
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        brain.append(
            "preference-spine",
            "Prefers dark themes.",
            metadata={"confidence": "0.85", "source_turn": "42"},
        )
        ns_dir = tmp_path / "20_Areas/agent-os/brain/preference-spine"
        file_text = next(ns_dir.glob("*.md")).read_text()
        assert "confidence: 0.85" in file_text
        assert "source_turn: 42" in file_text

    def test_custom_namespace_path(self, tmp_path: Path) -> None:
        """Unrecognised namespace is treated as a vault-relative path."""
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        brain.append("10_Projects/my-project", "Project note content.")
        custom_dir = tmp_path / "10_Projects/my-project"
        assert custom_dir.exists()
        assert len(list(custom_dir.glob("*.md"))) == 1

    def test_record_id_in_frontmatter(self, tmp_path: Path) -> None:
        from engine.agent.brain import Brain
        brain = Brain(vault_dir=tmp_path, brain_db=tmp_path / "brain.db")
        record_id = brain.append("reasoningbank", "Some content.")
        ns_dir = tmp_path / "20_Areas/agent-os/brain/reasoningbank"
        file_text = next(ns_dir.glob("*.md")).read_text()
        assert record_id in file_text
