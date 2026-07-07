# The Exploration agent

The **first thing JoadT does when a repo is attached to a tentacle.** It maps the repo and
audits its *latches* — the handholds JoadT needs to grip and operate it — then emits an
**App Profile** that configures the tentacle.

> Grip metaphor: a tentacle can't hold a repo it doesn't understand, and can't operate one
> missing the handholds (a build command, a lockfile, tests…). Exploration finds the grip.

Implementation: [`scripts/explore.py`](../scripts/explore.py) — deterministic, dependency-free
(Python 3.8+). Runs with no API and no install. A deeper LLM nuance pass layers on top later
(see *Next layer* below).

```
python scripts/explore.py [repo_path]
# → prints a grip report, writes .joadt/profile.json
# exit 0 = full grip · 1 = missing latches · 2 = no grip
```

## The latch catalog

What JoadT looks for to grip a repo. Each latch is `present` / `missing` / `broken`.

| Latch | Sev | Why JoadT needs it |
|-------|-----|--------------------|
| `stack` | high | can't pick tooling without knowing the language/framework |
| `dependency-manifest` | high | the declared dependency surface |
| `lockfile` | medium | reproducible installs (drift is a real failure mode) |
| `build-command` | medium | a way to build the app |
| `tests` | medium | a suite JoadT can run and extend |
| `lint-config` | low | quality signal + conventions |
| `ci-wiring` | low | connected to the SDLC pipeline |
| `learning-log` | low | the project's memory hook |
| `entrypoint` | medium | where the app starts |
| `no-committed-secrets` | high | a committed `.env` is a **broken** latch (security) |
| `env-contract` | low | documented required env (`.env.example`) |

## Grip verdict

- **full** — no missing latches → JoadT can operate the repo.
- **partial** — attachable, but some latches need prep (the report lists the fixes).
- **none** — unknown stack → JoadT can't operate it yet.

## App Profile (`.joadt/profile.json`)

The machine-readable output that configures the tentacle and feeds later phases (the Planner's
ownership map, defect triage, etc.). Shape:

```json
{
  "repo": "tablee",
  "explored_at": "2026-07-06T…Z",
  "grip": "partial",
  "stack": { "language": "node", "frameworks": ["react","express","vite","vitest"],
             "package_manager": "npm", "build": "npm run build", "test": "npm test" },
  "entrypoints": ["index.html", "server/index.js", "src/main.jsx"],
  "dependencies": { "external": ["…"], "count": 12 },
  "latches": [ { "name": "lint-config", "status": "missing", "severity": "low",
                 "detail": "…", "fix": "add eslint/ruff/prettier config" } ],
  "missing_latches": ["lint-config"]
}
```

The profile is **per-run and git-ignored** (`.joadt/`) — regenerate it by re-exploring. (A repo
may later choose to commit its profile as a canonical record.)

## Next layer — the LLM nuance pass

The deterministic core finds the *facts*. A follow-on pass (Claude, structured output, à la
`triage.py`/`plan.py`) adds *judgment* the scan can't: non-obvious/implicit dependencies, the
framework's conventions, hidden coupling, a risk read, and a **prioritized prep plan** for the
missing latches. It reads `.joadt/profile.json` + the file tree and enriches the profile. Kept
separate so the free, fast, testable core always runs first.

## Where it sits in the tentacle lifecycle

```
attach repo → EXPLORE (this) → prep missing latches → App Profile → the app's own agentic SDLC
```
