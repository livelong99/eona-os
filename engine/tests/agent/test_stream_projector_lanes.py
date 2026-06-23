"""_StreamProjector — per-agent lane attribution for the brainstorm swarm.

A single turn can fan out to many parallel sub-agents (the brainstorm PM spawns
four specialists at once). Every streamed event must be tagged with the lane
(``parent_tool_use_id`` / ``span_id``) of the agent that produced it so the
dashboard can render a proper per-agent execution view.
"""
from __future__ import annotations

from agent.claude_code_runtime import _StreamProjector


def _collect():
    events = []
    return events, _StreamProjector("run_test", lambda ev: events.append(ev))


def _sub(parent, dtype, value):
    return {
        "type": "stream_event",
        "is_subagent": True,
        "parent_tool_use_id": parent,
        "subagent_type": "general-purpose",
        "event": {"type": dtype, **value},
    }


def test_parallel_subagents_get_distinct_lanes():
    events, p = _collect()
    # PM spawns Task A
    p.handle({"type": "stream_event", "event": {"type": "content_block_start",
              "content_block": {"type": "tool_use", "id": "task_A", "name": "Task"}}})
    p.handle({"type": "stream_event", "event": {"type": "content_block_delta",
              "delta": {"type": "input_json_delta",
                        "partial_json": '{"description":"Creativity probe"}'}}})
    p.handle({"type": "stream_event", "event": {"type": "content_block_stop"}})
    # Specialist A thinks
    p.handle(_sub("task_A", "content_block_start", {"content_block": {"type": "thinking"}}))
    p.handle(_sub("task_A", "content_block_delta", {"delta": {"type": "thinking_delta", "thinking": "A"}}))
    p.handle(_sub("task_A", "content_block_stop", {}))
    # Specialist B thinks (different lane)
    p.handle(_sub("task_B", "content_block_start", {"content_block": {"type": "thinking"}}))
    p.handle(_sub("task_B", "content_block_delta", {"delta": {"type": "thinking_delta", "thinking": "B"}}))
    p.handle(_sub("task_B", "content_block_stop", {}))
    # Task A completes
    p.handle_tool_result_block({"tool_use_id": "task_A", "content": "A done"})
    # turn end (flushes task_B)
    p.handle({"type": "result", "session_id": "s1"})

    kinds = [e["event"] for e in events]
    # Two distinct spans opened, both closed.
    started = [e for e in events if e["event"] == "subagent.started"]
    completed = [e for e in events if e["event"] == "subagent.completed"]
    assert {e["span_id"] for e in started} == {"task_A", "task_B"}
    assert {e["span_id"] for e in completed} == {"task_A", "task_B"}

    # Reasoning is attributed to the right lane.
    reasonings = [e for e in events if e["event"] == "reasoning.available"]
    by_lane = {e["parent_tool_use_id"]: e["text"] for e in reasonings}
    assert by_lane == {"task_A": "A", "task_B": "B"}

    # The Task tool events carry the tool_use id (tid) and stay in the PM lane.
    task_started = [e for e in events if e["event"] == "tool.started" and e.get("tool") == "Task"]
    assert task_started and task_started[0]["tid"] == "task_A"
    assert "parent_tool_use_id" not in task_started[0]  # main/PM lane
    assert task_started[0]["preview"] == "Creativity probe"


def test_task_completion_carries_subagent_report():
    # The CLI may not stream a sub-agent's inner events, so the Task's result is
    # surfaced on tool.completed for the dashboard to show in the lane.
    events, p = _collect()
    p.handle({"type": "stream_event", "event": {"type": "content_block_start",
              "content_block": {"type": "tool_use", "id": "tA", "name": "Task"}}})
    p.handle({"type": "stream_event", "event": {"type": "content_block_delta",
              "delta": {"type": "input_json_delta",
                        "partial_json": '{"description":"Feasibility probe"}'}}})
    p.handle({"type": "stream_event", "event": {"type": "content_block_stop"}})
    p.handle_tool_result_block({"tool_use_id": "tA", "content": "FEASIBILITY: build risk Z"})
    completed = [e for e in events if e["event"] == "tool.completed" and e.get("tool") == "Task"]
    assert completed and completed[0]["tid"] == "tA"
    assert completed[0]["result"] == "FEASIBILITY: build risk Z"


def test_agent_tool_name_2_1_x():
    # Current CLIs (2.1.185) name the sub-agent spawn tool "Agent" (not "Task")
    # and deliver its result as a full user message, not a streamed block.
    events, p = _collect()
    p.handle({"type": "stream_event", "event": {"type": "content_block_start",
              "content_block": {"type": "tool_use", "id": "tA", "name": "Agent"}}})
    p.handle({"type": "stream_event", "event": {"type": "content_block_delta",
              "delta": {"type": "input_json_delta",
                        "partial_json": '{"description":"Creativity specialist"}'}}})
    p.handle({"type": "stream_event", "event": {"type": "content_block_stop"}})
    # result as a user-message tool_result (engine loop extracts these blocks)
    p.handle_tool_result_block({"tool_use_id": "tA", "content": "CREATIVITY: angle X"})
    started = [e for e in events if e["event"] == "tool.started" and e.get("tool") == "Agent"]
    completed = [e for e in events if e["event"] == "tool.completed" and e.get("tool") == "Agent"]
    assert started and started[0]["preview"] == "Creativity specialist" and started[0]["tid"] == "tA"
    assert completed and completed[0]["result"] == "CREATIVITY: angle X"


def test_main_agent_events_have_no_lane():
    events, p = _collect()
    p.handle({"type": "stream_event", "event": {"type": "content_block_start",
              "content_block": {"type": "thinking"}}})
    p.handle({"type": "stream_event", "event": {"type": "content_block_delta",
              "delta": {"type": "thinking_delta", "thinking": "PM thinking"}}})
    p.handle({"type": "stream_event", "event": {"type": "content_block_stop"}})
    reasonings = [e for e in events if e["event"] == "reasoning.available"]
    assert reasonings and "parent_tool_use_id" not in reasonings[0]
