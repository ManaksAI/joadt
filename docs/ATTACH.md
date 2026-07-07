# Attach — plugging a repo into a tentacle

**Attach** turns a repo into an operable **tentacle**. It orchestrates the exploration loop,
derives the repo's operable config from the App Profile, and registers it with the control plane.

Implementation: [`scripts/attach.py`](../scripts/attach.py).

```bash
python scripts/attach.py <repo> [--deep] [--prep|--prep-apply] [--register <dir>]
# exit: 0 operable · 1 attached-needs-prep · 2 cannot attach
```

## What it does

```
attach = explore (facts)                       # scripts/explore.py
       → [--deep]  judgment                     # scripts/explore_deep.py  (API-gated)
       → [--prep]  secure latches               # scripts/prep.py
       → derive tentacle config
       → [--register]  tell the control plane   # tentacles/
```

## Tentacle config (`.joadt/tentacle.json`, in the attached repo)

The operable distillation of the App Profile — what JoadT needs to *run* this repo:

```json
{
  "tentacle": "tablee",
  "remote": "https://github.com/ManaksAI/tablee.git",
  "grip": "full",
  "operable": true,
  "stack": { "language": "node", "frameworks": ["react","express","vite"], "package_manager": "npm" },
  "commands": { "build": "make build", "test": "make test-unit", "lint": "make lint" },
  "risk": "unknown",
  "entrypoints": ["server/index.js", "src/main.jsx"],
  "open_latches": []
}
```

`commands` prefer the `make` contract (so the tentacle operates through the standard SDLC
pipeline); it falls back to stack-native commands when there's no Makefile.

## Operable verdict

- **operable** — `grip: full`, or `partial` with no *high-severity* open latch → JoadT can run
  this repo's SDLC now.
- **needs prep** — `partial` with a high-severity gap → attach, but run `prep.py --apply` first.
- **cannot attach** — `grip: none` (unknown stack).

## The control plane

`--register <dir>` writes the record into [`tentacles/`](../tentacles/) and rebuilds
`index.json` — the roster the octopus head reads. See [`tentacles/README.md`](../tentacles/README.md).

## Lifecycle

```
attach repo → EXPLORE → [DEEP] → [PREP] → tentacle config → REGISTER → the app's own agentic SDLC
```
