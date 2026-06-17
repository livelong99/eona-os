#!/usr/bin/env bash
# Seed the canonical set of 24/7 cron jobs into the running hermes container.
#
# Jobs are created via cron.jobs.create_job (carrying the `autonomy` tier added
# for tiered unattended execution — see cron/scheduler.py). Idempotent: a job
# whose name already exists is skipped, so this is safe to re-run after a fresh
# deploy. Edit the SEED list below to curate your own jobs.
#
# Autonomy tiers (claude_code permission mode):
#   content/full -> bypassPermissions  (read/research/content; runs fully
#                                        unattended without pausing)
#   guarded/unset -> acceptEdits + Tirith (Bash/shell/git still gated/scanned)
#
# Usage: scripts/seed-cron.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SVC="${HERMES_SERVICE:-hermes}"

docker compose exec -T "$SVC" python3 - <<'PY'
from cron.jobs import create_job, list_jobs

existing = {j.get("name") for j in list_jobs(include_disabled=True)}

# Representative seed jobs. All content-tier (research/digest) so they run fully
# unattended. `deliver=local` always saves output under ~/.hermes/cron output
# regardless of whether a messaging gateway is configured. Extend freely.
SEED = [
    dict(
        name="Morning vault digest",
        schedule="0 8 * * *",
        autonomy="content",
        deliver="local",
        prompt=(
            "Research notable updates relevant to my active projects using web "
            "search and any available memory tools. Produce a concise dated "
            "digest. If there is nothing notable, reply with [SILENT]."
        ),
    ),
    dict(
        name="Inbox triage",
        schedule="every 6h",
        autonomy="content",
        deliver="local",
        prompt=(
            "Review recent captures in my notes inbox. Summarize new items and "
            "suggest where each should be filed (Projects/Areas/Resources/"
            "Archive). Do NOT move or delete anything. If nothing new, reply "
            "with [SILENT]."
        ),
    ),
]

for spec in SEED:
    if spec["name"] in existing:
        print(f"skip (exists): {spec['name']}")
        continue
    job = create_job(
        prompt=spec["prompt"],
        schedule=spec["schedule"],
        name=spec["name"],
        deliver=spec["deliver"],
        autonomy=spec["autonomy"],
    )
    print(f"created: {job['name']} [{job['id']}] autonomy={job.get('autonomy')}")

print("done.")
PY
