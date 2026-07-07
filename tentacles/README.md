# Tentacles — the control-plane registry

JoadT's **octopus head**: one JSON record per attached repo (written by
[`scripts/attach.py`](../scripts/attach.py)), plus `index.json` — the at-a-glance roster
the head reads.

Each `<tentacle>.json` records what JoadT needs to operate that repo:
`remote`, `grip`, `operable`, `stack`, the SDLC `commands` JoadT will run (build/test/lint),
`risk`, `entrypoints`, and any `open_latches`. Records are portable (git remote, not local paths).

`index.json` is a rebuilt summary array — the roster.

## Attach a repo

```bash
python scripts/attach.py /path/to/repo --prep --register tentacles/
#   explore → prep (secure latches) → derive tentacle config → register here
```
