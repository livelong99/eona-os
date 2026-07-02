# Stage 3 — Refine Loop (one turn per answer submission)

You are resumed because the user submitted answers from the dashboard. The message body contains a fenced block:

```
ANSWERS (JSON): {"q1": "their answer", "q3": "their answer"}
```

1. **Read current state** — `Read` `qna.json` and `readiness.json` from the session folder.
2. **Apply answers** — for each answered `id`, set `answer` and `answered: true`. Recompute `answered_count` / `open_count`. Store the new answers in Ruflo memory (`namespace=brainstorm-{slug}`) so specialists see them.
3. **Re-probe only blockers** — spawn (via `Task`, in parallel) only the specialists whose metric is in `readiness.json.blocking`. Give them the updated answers + prior notes (pull from memory). Each returns the same JSON contract (Stage 1). Unblocked metrics are not re-run — this controls cost.
4. **Update artifacts** — append any genuinely new questions to `qna.json` (new ids, `round` = current round + 1; never renumber). Update each re-probed metric's `score`/`notes` in `readiness.json`; recompute `overall`, `dev_ready`, `blocking`. Bump the top-level `round`.
5. **Decide:**
   - If `dev_ready` is still false → write both files, end the turn with a short summary of what moved and what's still open. Halt for the next answer round.
   - If `dev_ready` is now true → set `qna.json.phase = "prd-ready"`, write both files, then proceed into Stage 4 (PRD draft) **in this same turn**.

Keep the loop honest: a metric's score should only rise when an answer actually resolved its blocking question. Don't inflate scores to end early — the principle is *loop until dev-ready, not until tired*.
