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

## Securing the grip — the prep agent

[`scripts/prep.py`](../scripts/prep.py) reads the profile and **fixes the missing latches** with
safe, *additive* changes so a tentacle can grip the repo. It only ever adds files (starter lint
config, a smoke test, `.env.example`, a learning-log scaffold, the CI caller) or regenerates a
lockfile. It **never** rewrites history, removes committed secrets, or invents a stack — anything
needing judgment is reported, not touched.

```
python scripts/prep.py [repo_path]            # dry-run: prints the plan
python scripts/prep.py [repo_path] --apply     # writes the additive fixes
```

Split of responsibility:
- **auto-fixable** → lint-config, tests, env-contract, learning-log, ci-wiring, lockfile
- **needs a human** → stack, dependency-manifest, entrypoint, committed-secrets

## Seeing more — the deep pass

[`scripts/explore_deep.py`](../scripts/explore_deep.py) layers *judgment* on the deterministic
facts (Claude, structured output, à la `triage.py`/`plan.py`): implicit/undeclared dependencies,
the framework's conventions, hidden coupling, a risk read, and a **prioritized prep plan**. It
enriches `profile["deep"]`. Kept separate + API-gated so the free, fast core always runs first.

## Where it sits in the tentacle lifecycle

```
attach repo → EXPLORE (facts) → [DEEP pass: judgment] → PREP (secure latches) → App Profile
            → the app's own agentic SDLC
```
