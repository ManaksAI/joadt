<img src="assets/logo.svg" width="88" alt="JoadT logo" align="left" />

# JoadT

**A tentacle into every app.** JoadT is an agentic internal developer platform:
plug in any app and it self-onboards — an analyzer maps its assets, dependencies and
nuances — then it runs that app's own **agentic SDLC** (analyze → plan → build → test → ship),
in isolation, gated by humans. *Everywhere your code is.*

<br clear="left" />

> The name: **Joad** (after Tom Joad — *"I'll be everywhere"*) + **T** for **Tentacles**.
> One central brain; many tentacles, each reaching into an app.

---

## The idea

```
            ┌──────────────── JoadT brain ────────────────┐
            │  reusable SDLC rules · orchestrator agents   │
            │  cross-app learning log                      │
            └───┬───────────┬───────────┬───────────┬──────┘
        tentacle│           │           │           │
            ▼               ▼           ▼           ▼
        [ Node app ]  [ Python API ] [ Mobile ]  [ Infra ]
             │  plug in → ANALYZE (assets · deps · nuances)
             │         → APP PROFILE (stack · targets · risk)
             │         → INTEGRATED → its own isolated SDLC
```

Each tentacle gives an app an **independent, isolated** develop/test/deploy pipeline that
still shares the brain's rules and accumulated learnings. See the design + enterprise guide
in [ManaksAI/sdlc-templates](https://github.com/ManaksAI/sdlc-templates):
`SANDBOX-ORCHESTRATOR.md` and `ENTERPRISE-PLAYBOOK.md`.

## It eats its own dog food

This repo **inherits the very SDLC it implements.** JoadT is built *using* JoadT's pipeline:

| Inherited from `sdlc-templates` | What it does |
|---------------------------------|--------------|
| `ci.yml` / `release.yml` | parallel CI + tagged releases |
| `ai-sdlc.yml` / `review.yml` | single-agent requirement → PR, independent review |
| `ai-sdlc-parallel.yml` | **the orchestrator** — requirement → plan → parallel file-fenced build agents |
| `docs/learning-log/` | the project's compounding memory (prompts + runbook + helper scripts) |

File a requirement (issue + `requirement-parallel` label) and JoadT's own pipeline plans and
builds it — the platform bootstrapping itself.

## Status

Early. The **orchestrator is the working nucleus** (proven end-to-end); the platform layer
around it — the self-configuring **Analyzer**, the **App Profile** schema, and the **registry /
control plane** — is the build ahead. Rollout is scoped by stack archetype, not "any app at once."

## Brand

Logo: a minimal monochrome pixel-art octopus — `assets/logo.svg` (scalable). Slate/charcoal
instrument aesthetic, matching the house style. The eight arms are the tentacles.
