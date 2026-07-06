# Learning log

The project's memory across requirements. Before building anything new, the **Learning-analyst**
agent reads this log to answer: *have we built this shape before? does it already exist? how
different is it? what bottlenecks and alternatives are on record?* After a requirement ships,
its learnings are consolidated back here so the next one starts smarter.

Part of the [parallel-sandbox SDLC orchestrator](https://github.com/ManaksAI/sdlc-templates/blob/main/SANDBOX-ORCHESTRATOR.md).

## How it works

- **Read-only during a run.** Every worktree sandbox is a full copy of the repo, so each agent
  gets this log automatically. Agents only *read* it while working → no write contention.
- **Written once, at the end.** Per-sandbox learnings are captured to `.learnings/sandbox-<id>.md`
  during the run, then consolidated into `entries/` here in a single sequential step on the
  integration branch.

## Layout

```
docs/learning-log/
├── README.md                 # this file
├── RUNBOOK.md                # how to run one wave through all 4 phases
├── INDEX.md                  # one line per entry — scan/grep this first
├── entries/
│   └── YYYY-MM-DD-<slug>.md   # one learning per file (schema below)
├── examples/
│   └── ownership.example.json # shape of the Planner's per-wave ownership map
└── prompts/                  # agent prompt templates
    ├── learning-analyst.md    # Phase 1 — what do we already know?
    ├── code-analyst.md        # Phase 1 — where does it fit + risk?
    ├── planner.md             # Phase 1 — plan + file-ownership map
    ├── developer.md           # Phase 2 — implement a slice (per sandbox)
    ├── test-author.md         # Phase 2 — unit tests (per sandbox)
    ├── learning-agent.md      # Phase 2 — apply + capture learnings (per sandbox)
    ├── consolidate.md         # Phase 4 — fold .learnings/* into the log (once, sequential)
    └── integration-triage.md  # Phase 3 — route an integration failure to its owning sandbox
```

Helper scripts:
- `node scripts/validate-learning-log.mjs` — validate the log (schema + index cross-links).
- `node scripts/triage-owner.mjs <files>` — map files to the owning sandbox (Phase-3 triage).

See [`RUNBOOK.md`](RUNBOOK.md) for the end-to-end operating procedure.

## Entry schema

Each `entries/*.md` carries front matter plus prose sections:

```markdown
---
date: YYYY-MM-DD
slug: short-kebab-slug
tags: [module, area, kind]      # used to match future requirements
requirement: one-line summary
---

## Approach
## Bottleneck
## How overcome
## Alternatives
## Outcome
```

## Adding an entry

1. Create `entries/YYYY-MM-DD-<slug>.md` from the schema above.
2. Add one line to `INDEX.md`: `` - [<title>](entries/<file>.md) — <tags> — <hook> ``.
3. Keep it factual and specific — a future agent acts on it cold.
