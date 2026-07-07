#!/usr/bin/env python3
"""JoadT latch-prep agent.

Reads the App Profile (.joadt/profile.json from explore.py) and SECURES the missing
latches — applying safe, ADDITIVE fixes so a tentacle can grip the repo. It only ever
*adds* files (starter configs, scaffolds); it never rewrites history, never removes
committed secrets, and never invents a stack. Anything that needs human judgment is
reported, not touched.

Dry-run by default (prints the plan). Pass --apply to write the fixes.

Usage:  python scripts/prep.py [repo_path] [--apply]
Exit:   0 = nothing left needing a human · 1 = human-required latches remain
"""
import json
import os
import subprocess
import sys

args = [a for a in sys.argv[1:] if a != "--apply"]
APPLY = "--apply" in sys.argv
repo = os.path.abspath(args[0] if args else ".")
os.chdir(repo)

prof_path = ".joadt/profile.json"
if not os.path.exists(prof_path):
    print("no .joadt/profile.json — run `python scripts/explore.py` first.")
    sys.exit(2)
profile = json.load(open(prof_path))
lang = (profile.get("stack") or {}).get("language")
missing = {l["name"]: l for l in profile["latches"] if l["status"] != "present"}

# ── fix content, keyed by stack where it matters ──
ESLINT = json.dumps({
    "root": True, "env": {"browser": True, "node": True, "es2022": True},
    "extends": "eslint:recommended",
    "parserOptions": {"ecmaVersion": 2022, "sourceType": "module"},
}, indent=2) + "\n"
RUFF = "[lint]\nselect = [\"E\", \"F\", \"I\"]\n"
SMOKE_JS = ("import test from 'node:test';\nimport assert from 'node:assert';\n\n"
            "test('smoke', () => {\n  assert.ok(true);\n});\n")
SMOKE_PY = "def test_smoke():\n    assert True\n"
ENV_EXAMPLE = "# Document required environment variables here (no real values).\n# EXAMPLE_API_KEY=\n"
LOG_INDEX = ("# Learning log — index\n\nOne line per entry. Scan or `grep` this first.\n\n"
             "_No entries yet._\n")
LOG_README = ("# Learning log\n\nThe project's memory across requirements. Read before building; "
              "consolidate after shipping.\n")
CI_CALLER = ("name: CI\n\non:\n  push:\n    branches: [main, 'feature/**']\n  pull_request:\n\n"
             "jobs:\n  ci:\n    uses: ManaksAI/sdlc-templates/.github/workflows/standard-sdlc.yml@v1\n")


def files_for(latch):
    """Return {path: content} of additive fixes for a latch, or None if human-required."""
    if latch == "lint-config":
        return {"ruff.toml": RUFF} if lang == "python" else {".eslintrc.json": ESLINT}
    if latch == "tests":
        return {"tests/test_smoke.py": SMOKE_PY} if lang == "python" else {"test/smoke.test.js": SMOKE_JS}
    if latch == "env-contract":
        return {".env.example": ENV_EXAMPLE}
    if latch == "learning-log":
        return {"docs/learning-log/INDEX.md": LOG_INDEX, "docs/learning-log/README.md": LOG_README}
    if latch == "ci-wiring":
        return {".github/workflows/ci.yml": CI_CALLER}
    return None  # stack, dependency-manifest, entrypoint, no-committed-secrets, lockfile → special/human


# lockfile has a command fix (regenerate), not a file scaffold
def lockfile_fix():
    if lang == "node":
        return ["npm", "install", "--no-audit", "--no-fund"]
    return None


HUMAN_ONLY = {"stack", "dependency-manifest", "entrypoint", "no-committed-secrets"}

planned, human = [], []
writes = {}  # path -> content

for name, latch in missing.items():
    if name in HUMAN_ONLY:
        human.append(latch)
        continue
    if name == "lockfile":
        cmd = lockfile_fix()
        if cmd:
            planned.append(("lockfile", "run: " + " ".join(cmd), cmd))
        else:
            human.append(latch)
        continue
    fx = files_for(name)
    if not fx:
        human.append(latch)
        continue
    for p, c in fx.items():
        if os.path.exists(p):
            continue  # never clobber
        writes[p] = c
    planned.append((name, "add " + ", ".join(fx.keys()), None))

# ── report ──
mode = "APPLY" if APPLY else "dry-run"
print(f"\n  JoadT latch-prep — {profile['repo']}  ({mode})")
print(f"  grip: {profile['grip']} · {len(missing)} latch(es) missing\n")

if planned:
    print("  auto-fixable:")
    for name, desc, _ in planned:
        print(f"    + {name:20} {desc}")
else:
    print("  auto-fixable: (none)")

if human:
    print("\n  needs a human:")
    for l in human:
        print(f"    ! {l['name']:20} {l['detail']}  → {l['fix']}")

if APPLY:
    for p, c in writes.items():
        os.makedirs(os.path.dirname(p), exist_ok=True) if os.path.dirname(p) else None
        open(p, "w").write(c)
    if writes:
        print(f"\n  wrote {len(writes)} file(s).")
    for name, desc, cmd in planned:
        if cmd:
            print(f"  running: {' '.join(cmd)}")
            try:
                subprocess.run(cmd, check=True)
            except Exception as e:
                print(f"    (failed: {e} — do it manually)")
    print("  → re-run explore.py to confirm the grip improved.")
else:
    print(f"\n  → dry-run only. Re-run with --apply to write {len(writes)} file(s)"
          + (" and regenerate the lockfile." if any(c for _, _, c in planned) else "."))

print()
sys.exit(1 if human else 0)
