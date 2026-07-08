#!/usr/bin/env python3
"""JoadT Exploration agent.

The FIRST thing that runs when a repo is attached to a tentacle. It maps the repo
(stack + dependencies) and audits its "latches" — the handholds JoadT needs to grip
and operate it. Emits an App Profile (.joadt/profile.json) and a human-readable grip
report.

Deterministic + dependency-free (Python 3.8+). A deeper LLM nuance pass can layer on
top later (see docs/EXPLORER.md); this core runs with no API and no install.

Usage:  python scripts/explore.py [repo_path]     (default: current directory)
Exit:   0 = full grip · 1 = missing latches (attachable, needs prep) · 2 = no grip
"""
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone

repo = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
os.chdir(repo)


def list_files():
    try:
        return subprocess.check_output(["git", "ls-files"], text=True).splitlines()
    except Exception:
        out = []
        for root, dirs, fs in os.walk("."):
            dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "dist", ".venv")]
            for f in fs:
                out.append(os.path.relpath(os.path.join(root, f)))
        return out


files = list_files()
fset = set(files)
has = lambda p: p in fset
globq = lambda pat: [f for f in files if re.search(pat, f)]


def read_json(p):
    try:
        return json.load(open(p))
    except Exception:
        return {}


# ─────────────────────────── stack + dependencies ───────────────────────────
stack = {"language": None, "frameworks": [], "package_manager": None,
         "build": None, "test": None}
external = []

# Watch-face stacks first — Pebble can also carry a package.json, so check it before node.
if has("appinfo.json") or (has("package.json") and "pebble" in read_json("package.json")):
    stack.update(language="pebble", package_manager="pebble", build="pebble build",
                 test=None, frameworks=["pebble"])
elif has("manifest.xml") and (has("monkey.jungle") or globq(r"\.mc$")):
    stack.update(language="garmin", package_manager="connectiq", build="monkeyc",
                 test=None, frameworks=["connectiq"])
elif has("package.json"):
    pkg = read_json("package.json")
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    external = sorted(deps)
    scripts = pkg.get("scripts", {})
    stack.update(
        language="node",
        frameworks=[f for f in ("react", "vue", "svelte", "next", "express",
                                "fastify", "vite", "vitest") if f in deps],
        package_manager="pnpm" if has("pnpm-lock.yaml")
        else "yarn" if has("yarn.lock") else "npm",
        build="npm run build" if "build" in scripts else None,
        test="npm test" if "test" in scripts else None,
    )
elif has("pyproject.toml") or has("requirements.txt") or has("setup.py"):
    stack["language"] = "python"
    if has("requirements.txt"):
        try:
            external = sorted(
                re.split(r"[=<>~!\[ ]", ln, 1)[0]
                for ln in open("requirements.txt")
                if ln.strip() and not ln.startswith("#")
            )
        except Exception:
            pass
    stack["frameworks"] = [f for f in ("django", "flask", "fastapi", "pytest")
                           if any(f in d.lower() for d in external)]
    stack["package_manager"] = ("poetry" if has("poetry.lock")
                                else "pipenv" if has("Pipfile.lock") else "pip")
    stack["test"] = "pytest" if has("requirements.txt") or globq(r"test") else None
elif has("go.mod"):
    stack.update(language="go", package_manager="gomod", build="go build ./...", test="go test ./...")
elif has("Cargo.toml"):
    stack.update(language="rust", package_manager="cargo", build="cargo build", test="cargo test")

# entrypoints — common conventions per stack
ENTRY_PATTERNS = [r"^server/index\.(js|ts)$", r"^src/main\.(js|jsx|ts|tsx)$",
                  r"^index\.html$", r"^(main|app)\.py$", r"^src/app\.py$",
                  r"^cmd/.*/main\.go$", r"^src/main\.rs$"]
entrypoints = [f for f in files if any(re.match(p, f) for p in ENTRY_PATTERNS)]

# toolchain — the tools a stack needs to build/test. JoadT must KNOW these (and, next,
# provision them on demand) so it stays self-contained instead of assuming the host has them.
TOOLCHAINS = {
    "node": ["node", "npm"], "python": ["python3"], "go": ["go"], "rust": ["cargo"],
    "pebble": ["pebble"], "garmin": ["monkeyc"],
}
tc_required = TOOLCHAINS.get(stack["language"], [])
tc_missing = [t for t in tc_required if not shutil.which(t)]
tc_present = [t for t in tc_required if shutil.which(t)]


# ─────────────────────────── the latch catalog ───────────────────────────
# Each latch: what JoadT needs to grip the repo. status = present|missing|broken.
latches = []


def latch(name, ok, severity, detail, fix=None, status=None):
    latches.append({
        "name": name,
        "status": status or ("present" if ok else "missing"),
        "severity": severity,
        "detail": detail,
        "fix": fix,
    })


lockfiles = ("package-lock.json", "yarn.lock", "pnpm-lock.yaml",
             "poetry.lock", "Pipfile.lock", "go.sum", "Cargo.lock")
test_present = bool(globq(r"(^|/)(test|tests|__tests__)/|\.test\.|_test\.|test_.*\.py$"))
lint_present = bool([f for f in (".eslintrc", ".eslintrc.json", ".eslintrc.cjs",
                                 ".ruff.toml", "ruff.toml", ".flake8", ".prettierrc")
                     if has(f)]) or "ruff" in " ".join(external).lower()

latch("stack", stack["language"] is not None, "high",
      f"detected {stack['language']}" if stack["language"] else "no known stack detected",
      fix="add a recognized manifest (package.json / pyproject.toml / go.mod …)")
latch("dependency-manifest",
      any(has(m) for m in ("package.json", "pyproject.toml", "requirements.txt",
                           "setup.py", "go.mod", "Cargo.toml")),
      "high", f"{len(external)} external dependencies declared" if external
      else "no dependency manifest found",
      fix="declare dependencies in a manifest")
latch("toolchain", bool(tc_required) and not tc_missing, "high",
      (", ".join(tc_present) + " available") if tc_required and not tc_missing
      else ("missing: " + ", ".join(tc_missing)) if tc_missing
      else "no toolchain resolved (unknown stack)",
      fix=(f"provision the {stack['language']} toolchain: {', '.join(tc_missing)}"
           if tc_missing else None),
      status="present" if (tc_required and not tc_missing) else "missing")
latch("lockfile", any(has(l) for l in lockfiles), "medium",
      "lockfile present (verify sync at install time)" if any(has(l) for l in lockfiles)
      else "no lockfile — installs are not reproducible",
      fix="commit a lockfile; use `npm ci || npm install` in CI to survive drift")
latch("build-command", bool(stack["build"]) or has("Makefile"), "medium",
      "build available" if (stack["build"] or has("Makefile")) else "no build command",
      fix="add a `build` script or a Makefile `build` target")
latch("tests", test_present, "medium",
      "tests found" if test_present else "no tests detected",
      fix="add a unit test suite JoadT can run and extend")
latch("lint-config", lint_present, "low",
      "lint config present" if lint_present else "no lint/format config",
      fix="add eslint/ruff/prettier config")
latch("ci-wiring", has(".github/workflows/ci.yml"), "low",
      "CI caller present" if has(".github/workflows/ci.yml") else "not wired to the SDLC pipeline",
      fix="add the ci.yml caller from sdlc-templates")
latch("learning-log", has("docs/learning-log/INDEX.md"), "low",
      "learning log present" if has("docs/learning-log/INDEX.md") else "no learning log — no memory hook",
      fix="scaffold docs/learning-log/")
latch("entrypoint", bool(entrypoints), "medium",
      f"{len(entrypoints)} entrypoint(s): {', '.join(entrypoints[:3])}" if entrypoints
      else "no obvious entrypoint",
      fix="declare the app entrypoint")
# security latch: a committed .env is a broken latch, not a missing one
if has(".env"):
    latch("no-committed-secrets", False, "high", ".env is committed to the repo",
          fix="remove .env from git and add it to .gitignore", status="broken")
else:
    latch("no-committed-secrets", True, "high", "no committed .env", status="present")
latch("env-contract", has(".env.example"), "low",
      "env documented" if has(".env.example") else "no .env.example documenting required env",
      fix="add a .env.example")


# ─────────────────────────── grip verdict ───────────────────────────
missing = [l for l in latches if l["status"] != "present"]
high_gap = any(l["severity"] == "high" and l["status"] != "present" for l in latches)
no_stack = stack["language"] is None

grip = "none" if no_stack else ("partial" if missing else "full")

profile = {
    "repo": os.path.basename(repo),
    "explored_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "grip": grip,
    "stack": stack,
    "toolchain": {"required": tc_required, "present": tc_present, "missing": tc_missing},
    "entrypoints": entrypoints,
    "dependencies": {"external": external, "count": len(external)},
    "latches": latches,
    "missing_latches": [l["name"] for l in missing],
}

os.makedirs(".joadt", exist_ok=True)
with open(".joadt/profile.json", "w") as f:
    json.dump(profile, f, indent=2)


# ─────────────────────────── grip report ───────────────────────────
ICON = {"present": "✓", "missing": "·", "broken": "✗"}
print(f"\n  JoadT exploration — {profile['repo']}")
print(f"  stack: {stack['language'] or 'unknown'}"
      + (f" ({', '.join(stack['frameworks'])})" if stack["frameworks"] else "")
      + f" · {stack['package_manager'] or '—'} · {len(external)} deps")
if entrypoints:
    print(f"  entry: {', '.join(entrypoints[:3])}")
print("\n  latches:")
for l in latches:
    tag = "" if l["status"] == "present" else f"   ← {l['fix']}"
    print(f"    {ICON[l['status']]} {l['name']:22} [{l['severity']}] {l['detail']}{tag}")

verdict = {"full": "FULL grip — JoadT can operate this repo.",
           "partial": f"PARTIAL grip — attachable, but {len(missing)} latch(es) need prep.",
           "none": "NO grip — unknown stack; JoadT cannot operate this repo yet."}[grip]
print(f"\n  → {verdict}")
print(f"  → profile written to .joadt/profile.json\n")

sys.exit(0 if grip == "full" else 2 if grip == "none" else 1)
