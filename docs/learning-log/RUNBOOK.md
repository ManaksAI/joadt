# Orchestrator runbook — running one wave

How to take a requirement through all four phases by hand (the manual version the automated
`ai-sdlc` orchestrator will eventually drive). Worked example: today's 3-sandbox Tablée run.

## Phase 1 — analyze & plan

1. Spawn **Learning-analyst** (`prompts/learning-analyst.md`) and **Code-analyst**
   (`prompts/code-analyst.md`) in parallel, read-only, with the requirement filled in.
2. Feed both briefs to the **Planner** (`prompts/planner.md`).
3. Planner returns: slices, **file-ownership map**, frozen files, sandbox count, risk flags.
   - If it can't produce a clean ownership map → **do not parallelize**; use the single
     Developer path from `PLAYBOOK.md`.

## Phase 2 — parallel build (one sandbox per slice)

For each slice, spawn an agent with `isolation: "worktree"` carrying the **Developer**,
**Test-author**, and **Learning-agent** prompts, each fenced by the ownership map.

- Each sandbox = its own worktree (`.claude/worktrees/agent-<id>/`) on its own branch.
- A sandbox is **ready** only when its own unit tests pass.
- Per-sandbox learnings accumulate in `.learnings/sandbox-<id>.md` (git-ignored).

Cap at 2–4 sandboxes per wave — review bandwidth is the real limit, not agent count.

## Phase 3 — integrate & verify

1. Merge ready branches **smallest-first** onto an integration branch.
2. Run the **full** test suite (integration scenarios), not just per-slice unit tests — this
   catches semantic conflicts (slices each correct, wrong together).
3. On failure, run **Integration-triage** (`prompts/integration-triage.md`): for each failure it
   identifies the implicated source files and routes them to the owning sandbox via
   `node scripts/triage-owner.mjs <files>` (against `.wave/ownership.json`). Classifications:
   single-owner → that sandbox · frozen-file → sequential reconcile · cross-slice → the consumer
   adapts · unowned → back to the Planner.
4. The owning sandbox fixes → retest → reintegrate. **Loop until the full suite is green.**

## Phase 4 — ship & learn

1. All green → Reviewer pass → **human merge** (gate) → release tag.
2. **Consolidate** (`prompts/consolidate.md`): a single sequential agent reads every
   `.learnings/sandbox-*.md`, decides DROP / MERGE / NEW for each capture, writes new
   `entries/*.md`, and updates `INDEX.md`. This is the only step that writes the log.
3. **Validate**: `node scripts/validate-learning-log.mjs` checks every entry's schema +
   index links. Must pass before merge (wire into `make lint` / CI when ready).
4. Discard the git-ignored `.learnings/` scratch.

## Worked example (2026-06-30)

Requirement set: add tests + `/health` endpoint + README. Three clean slices, zero file overlap:

| Sandbox | Owned files | Result |
|---------|-------------|--------|
| A | `package.json`, `vite.config.js`, `src/data/budget.js`, `src/screens/OrderCard.jsx`, `test/**` | 16 tests pass |
| B | `server/index.js` | `/health` + logging |
| C | `README.md` | expanded docs |

Merged smallest-first, full suite green (16/16) on main, sandboxes torn down. The budget
extraction became the log's first entry. That run is the template this runbook generalizes.
