# Project Template

Starter template that wires every new project into the standard SDLC pipeline
([ManaksAI/sdlc-templates](https://github.com/ManaksAI/sdlc-templates)).

## Start a new project from this template

```bash
gh repo create my-new-project --private --template ManaksAI/project-template --clone
cd my-new-project
```

Or click **"Use this template"** on the GitHub repo page.

That's it — on your first push the parallel SDLC pipeline runs automatically.

## What you get

| File                          | Purpose                                                  |
|-------------------------------|----------------------------------------------------------|
| `.github/workflows/ci.yml`    | 5-line caller — references the central pipeline           |
| `Makefile`                    | Auto-detects language; maps `lint`/`test`/`build` to tools|
| `.gitleaks.toml`              | Secret-scanning config                                    |
| `.editorconfig`               | Consistent formatting across editors                     |
| `.gitignore`                  | Sensible defaults (Python / Node / Pebble / Garmin)      |

## Daily workflow

```bash
git checkout -b feature/my-thing
# ... write code ...
make ci            # run the WHOLE pipeline locally before pushing
git push -u origin feature/my-thing   # CI runs the same steps in parallel
```

The Makefile auto-detects the project type. Override if needed:

```bash
make lint PROJECT_TYPE=python
make info          # show what it detected
```

Supported out of the box: **python**, **node**, **pebble** (C), **garmin** (Monkey C).
Add tools to the relevant target in the `Makefile` as the project grows.
