"""_SubagentTailer — tails a sub-agent's transcript JSONL and projects its inner
work (thinking / text / tool calls) into the run's event stream as lane events.

The `claude` CLI does not stream sub-agent internals to the parent process, so we
tail ``{config}/projects/*/{session}/subagents/agent-*.jsonl`` to surface them.
"""
from __future__ import annotations

import json
from pathlib import Path

from agent.claude_code_runtime import _SubagentTailer, _StreamProjector


def _write(path: Path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")


def test_tailer_projects_thinking_text_and_tools(tmp_path, monkeypatch):
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path))
    sid = "11111111-2222-3333-4444-555555555555"
    f = tmp_path / "projects" / "-some-proj" / sid / "subagents" / "agent-abc.jsonl"
    _write(f, [
        # first user message = the brief → lane label (names the metric)
        {"type": "user", "message": {"content": [
            {"type": "text", "text": "You are the Creativity specialist. Probe novel angles."}]}},
        # assistant turn with thinking + text + a tool call
        {"type": "assistant", "message": {"content": [
            {"type": "thinking", "thinking": "Considering anti-cliche directions..."},
            {"type": "text", "text": "Novel angle: ledger-as-social-ritual."},
            {"type": "tool_use", "name": "Read", "input": {"file_path": "brief.md"}},
        ]}},
    ])

    events = []
    t = _SubagentTailer(session_id=sid, on_event=lambda e: events.append(e), run_id="run_x")
    t._poll()  # one synchronous drain (no thread needed for the test)

    kinds = [e["event"] for e in events]
    assert "reasoning.available" in kinds
    assert "message.delta" in kinds
    assert "tool.started" in kinds
    # all tagged as sub-agent lane events with the brief as the label
    assert all(e.get("subagent") is True for e in events)
    assert all("Creativity specialist" in e.get("lane_label", "") for e in events)
    reasoning = next(e for e in events if e["event"] == "reasoning.available")
    assert reasoning["text"] == "Considering anti-cliche directions..."
    msg = next(e for e in events if e["event"] == "message.delta")
    assert msg["delta"] == "Novel angle: ledger-as-social-ritual."


def test_main_transcript_is_pm_lane_and_skips_text(tmp_path, monkeypatch):
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path))
    sid = "99999999-0000-1111-2222-333333333333"
    # Main transcript sits beside the {session}/ dir, NOT under subagents/.
    main = tmp_path / "projects" / "-proj" / f"{sid}.jsonl"
    _write(main, [
        {"type": "assistant", "message": {"content": [
            {"type": "thinking", "thinking": "Briefing the swarm..."},
            {"type": "text", "text": "I'll spawn four specialists."},
            {"type": "tool_use", "id": "ag1", "name": "Agent",
             "input": {"description": "Creativity specialist"}},
        ]}},
        {"type": "user", "message": {"content": [
            {"type": "tool_result", "tool_use_id": "ag1", "content": "CREATIVITY: angle X"}]}},
    ])

    events = []
    t = _SubagentTailer(session_id=sid, on_event=lambda e: events.append(e),
                        run_id="r", include_main=True)
    t._poll()

    # PM lane → no subagent tag on any event.
    assert all(not e.get("subagent") for e in events)
    kinds = [e["event"] for e in events]
    assert "reasoning.available" in kinds        # thinking surfaced
    assert "message.delta" not in kinds          # main text skipped (token stream owns it)
    started = next(e for e in events if e["event"] == "tool.started")
    assert started["tool"] == "Agent" and started["tid"] == "ag1"
    completed = next(e for e in events if e["event"] == "tool.completed")
    assert completed["tool"] == "Agent" and completed["tid"] == "ag1"
    assert completed["result"] == "CREATIVITY: angle X"


def test_projector_suppress_exec_keeps_only_header():
    events = []
    p = _StreamProjector("r", lambda e: events.append(e), suppress_exec=True)
    p.handle({"type": "system", "subtype": "init", "model": "m", "tools": [], "mcp_servers": []})
    p.handle({"type": "stream_event", "event": {"type": "content_block_start",
              "content_block": {"type": "thinking"}}})
    p.handle({"type": "stream_event", "event": {"type": "content_block_delta",
              "delta": {"type": "thinking_delta", "thinking": "secret PM thoughts"}}})
    p.handle({"type": "stream_event", "event": {"type": "content_block_stop"}})
    kinds = [e["event"] for e in events]
    assert kinds == ["run.header"]  # exec events suppressed; transcript owns them


def test_start_snapshot_skips_history(tmp_path, monkeypatch):
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path))
    sid = "44444444-5555-6666-7777-888888888888"
    sub = tmp_path / "projects" / "-p" / sid / "subagents" / "agent-old.jsonl"
    _write(sub, [
        {"type": "user", "message": {"content": "Old brief"}},
        {"type": "assistant", "message": {"content": [{"type": "text", "text": "stale output"}]}},
    ])
    events = []
    t = _SubagentTailer(session_id=sid, on_event=lambda e: events.append(e), run_id="r")
    t.start()   # snapshots the pre-existing file as already-read
    try:
        t._poll()
        assert events == []  # history not replayed
        with sub.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps({"type": "assistant", "message": {"content": [
                {"type": "text", "text": "fresh"}]}}) + "\n")
        t._poll()
        assert [e["delta"] for e in events] == ["fresh"]
    finally:
        t.stop()


def test_tailer_is_incremental(tmp_path, monkeypatch):
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path))
    sid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    f = tmp_path / "projects" / "-p" / sid / "subagents" / "agent-1.jsonl"
    _write(f, [{"type": "user", "message": {"content": "Feasibility specialist brief"}}])

    events = []
    t = _SubagentTailer(session_id=sid, on_event=lambda e: events.append(e), run_id="r")
    t._poll()
    assert events == []  # only the brief so far, no assistant output

    # append an assistant turn; the next poll only emits the NEW line
    with f.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps({"type": "assistant", "message": {"content": [
            {"type": "text", "text": "Build risk: payment licensing."}]}}) + "\n")
    t._poll()
    assert len(events) == 1
    assert events[0]["event"] == "message.delta"
    assert events[0]["delta"] == "Build risk: payment licensing."
    assert events[0]["lane_label"] == "Feasibility specialist brief"
