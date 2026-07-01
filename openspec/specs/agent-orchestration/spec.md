# Capability: Agent Orchestration (Kanban dispatch)

Multi-agent work is coordinated through a SQLite Kanban board with atomic claims, plus async delegation
("Hive") and 24/7 cron with tiered autonomy. (Established behavior — `engine/hermes_cli/kanban_db.py`,
`engine/tools/kanban_tools.py`, `engine/cron/scheduler.py`, `engine/cron/budget_governor.py`.)

## Requirements

### Requirement: Tasks SHALL be dispatched through an atomic Kanban board

The engine SHALL persist tasks in a SQLite (WAL) Kanban board and SHALL claim work via atomic
compare-and-swap so that no two workers claim the same task.

#### Scenario: Two workers race for the same ready task

- **WHEN** two workers attempt to claim the same task in `ready` status
- **THEN** exactly one CAS succeeds and transitions the task to `running`; the other observes zero affected
  rows and moves on without retry-looping

#### Scenario: A worker wedges mid-task

- **WHEN** a claimed task's worker stops heartbeating beyond the claim TTL
- **THEN** the claim is considered stale and the task becomes reclaimable

### Requirement: Worker and orchestrator tools SHALL be scoped by context

The engine SHALL gate Kanban tools by the `HERMES_KANBAN_TASK` environment marker: a worker sees only its
own task's tools (complete/block/comment/heartbeat/show), while an orchestrator sees board-management tools
(create/unblock/link/list).

#### Scenario: A worker subprocess tries to create new board tasks

- **WHEN** a process running under `HERMES_KANBAN_TASK` calls an orchestrator-only tool
- **THEN** the tool is not available to it (worker scope only)

### Requirement: Cron jobs SHALL carry an autonomy tier

The scheduler SHALL set the spawned runtime's permission mode from the job's `autonomy` tier:
`content`/`full` → `bypassPermissions` (unattended), `guarded`/unset → `acceptEdits` (Bash/shell/git stay gated).

#### Scenario: A guarded cron job attempts a shell command

- **WHEN** a job with `autonomy` unset or `guarded` runs and its turn issues a Bash/git command
- **THEN** the command remains permission-gated rather than auto-approved
