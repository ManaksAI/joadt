#!/usr/bin/env python3
"""JoadT attach — plug a repo into a tentacle.

The onboarding orchestrator. Given a repo it runs the exploration loop, derives the
repo's operable **tentacle config** from the App Profile, and (optionally) registers
the tentacle with the control plane — the octopus head that sees every attached repo.

  attach = explore (facts) → [--deep: judgment] → [--prep: secure latches]
           → derive tentacle config → [--register: tell the control plane]

Usage:
  python scripts/attach.py <repo_path> [--deep] [--prep|--prep-apply] [--register <dir>]

Exit:  0 attached & operable · 1 attached but needs prep · 2 cannot attach (no grip)
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[1:]
flags = {a for a in argv if a.startswith("--")}
pos = [a for a in argv if not a.startswith("--")]
if not pos:
    print("usage: python scripts/attach.py <repo_path> [--deep] [--prep|--prep-apply] [--register <dir>]")
    sys.exit(2)
repo = os.path.abspath(pos[0])
register_dir = None
if "--register" in argv:
    i = argv.index("--register")
    register_dir = os.path.abspath(argv[i + 1]) if i + 1 < len(argv) else None


def run(script, *a):
    return subprocess.run([sys.executable, os.path.join(HERE, script), repo, *a]).returncode


def git(*a, default=""):
    try:
        return subprocess.check_output(
            ["git", "-C", repo, *a], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return default


# ── 1. explore (facts) ──
print(f"\n═══ attaching {os.path.basename(repo)} ═══", flush=True)
run("explore.py")

# ── 2. optional deep judgment ──
if "--deep" in flags:
    if os.environ.get("ANTHROPIC_API_KEY"):
        run("explore_deep.py")
    else:
        print("  (--deep skipped: no ANTHROPIC_API_KEY)")

# ── 3. optional prep ──
if "--prep-apply" in flags:
    run("prep.py", "--apply")
    run("explore.py")  # re-explore so grip reflects the fixes
elif "--prep" in flags:
    run("prep.py")

# ── 4. derive the tentacle config from the profile ──
prof_path = os.path.join(repo, ".joadt", "profile.json")
if not os.path.exists(prof_path):
    print("  ! exploration produced no profile — cannot attach.")
    sys.exit(2)
profile = json.load(open(prof_path))
stack = profile.get("stack") or {}
latches = profile.get("latches", [])
high_gap = any(l["severity"] == "high" and l["status"] != "present" for l in latches)
grip = profile.get("grip")
operable = grip == "full" or (grip == "partial" and not high_gap)

mk = os.path.exists(os.path.join(repo, "Makefile"))
lang = stack.get("language")
commands = {
    "build": "make build" if mk else stack.get("build"),
    "test": "make test-unit" if mk else stack.get("test"),
    "lint": "make lint" if mk else ("ruff check ." if lang == "python"
                                    else "npx eslint ." if lang == "node" else None),
}
risk = (profile.get("deep") or {}).get("risk_level", "unknown")

def sketch_architecture(profile):
    """A coarse ASCII architecture from deterministic signals (frontend/backend/services).
    The deep pass refines it; this is the facts-only sketch."""
    st = profile.get("stack") or {}
    fw = set(st.get("frameworks") or [])
    deps = {d.lower() for d in (profile.get("dependencies") or {}).get("external", [])}
    entry = profile.get("entrypoints") or []
    fe = next((f for f in ("next", "react", "vue", "svelte") if f in fw), None) or (
        "web" if any(e == "index.html" or e.startswith("src/") for e in entry) else None)
    be = next((f for f in ("express", "fastify", "koa") if f in fw or f in deps), None) or (
        "server" if any(e.startswith("server/") for e in entry) else None)
    svc = [name for keys, name in (
        ({"@anthropic-ai/sdk", "anthropic"}, "Claude (Anthropic)"),
        ({"openai"}, "OpenAI"),
        ({"pg", "postgres", "mysql", "mysql2", "mongoose", "mongodb", "prisma",
          "sqlite3", "better-sqlite3", "sequelize"}, "Database"),
        ({"redis", "ioredis"}, "Redis"), ({"stripe"}, "Stripe"),
    ) if deps & keys]
    lines = []
    if fe:
        lines += ["  browser", "     |", "     v", f"  [ frontend . {fe} ]"]
    if be:
        if fe:
            lines += ["     |  /api", "     v"]
        lines += [f"  [ backend . {be} ]"]
    for s in svc:
        lines += [f"     |--> {s}"]
    if not lines:
        lines = [f"  [ {st.get('language') or 'app'} ]"] + [f"     - {e}" for e in entry[:5]]
    return "\n".join(lines)


deep = profile.get("deep") or {}
tentacle = {
    "tentacle": profile["repo"],
    "attached_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "remote": git("remote", "get-url", "origin", default=profile["repo"]),
    "grip": grip,
    "operable": operable,
    "stack": {k: stack.get(k) for k in ("language", "frameworks", "package_manager")},
    "toolchain": profile.get("toolchain") or {},
    "commands": commands,
    "risk": risk,
    "entrypoints": profile.get("entrypoints", []),
    "architecture": sketch_architecture(profile),
    "dependencies": (profile.get("dependencies") or {}).get("external", [])[:40],
    "functionalities": deep.get("summary"),     # from the deep pass; null until it runs
    "conventions": deep.get("conventions", []),
    "open_latches": profile.get("missing_latches", []),
}
with open(prof_path.replace("profile.json", "tentacle.json"), "w") as f:
    json.dump(tentacle, f, indent=2)

# ── 5. optional: register with the control plane ──
if register_dir:
    os.makedirs(register_dir, exist_ok=True)
    rec = os.path.join(register_dir, f"{tentacle['tentacle']}.json")
    with open(rec, "w") as f:
        json.dump(tentacle, f, indent=2)
    # local path map (git-ignored) so the control-plane server can run actions locally
    lp = os.path.join(register_dir, ".local.json")
    local_map = json.load(open(lp)) if os.path.exists(lp) else {}
    local_map[tentacle["tentacle"]] = repo
    with open(lp, "w") as f:
        json.dump(local_map, f, indent=2)
    # rebuild the index the octopus head reads
    index = []
    for fn in sorted(os.listdir(register_dir)):
        if fn.endswith(".json") and fn != "index.json" and not fn.startswith("."):
            t = json.load(open(os.path.join(register_dir, fn)))
            index.append({
                "tentacle": t["tentacle"], "grip": t["grip"], "operable": t["operable"],
                "language": (t.get("stack") or {}).get("language"),
                "open_latches": len(t.get("open_latches", [])),
                "attached_at": t["attached_at"],
            })
    with open(os.path.join(register_dir, "index.json"), "w") as f:
        json.dump(index, f, indent=2)

# ── 6. attach report ──
verdict = ("ATTACHED & OPERABLE" if operable
           else "ATTACHED — needs prep" if grip != "none" else "CANNOT ATTACH (no grip)")
print(f"\n  tentacle : {tentacle['tentacle']}  ({tentacle['remote']})")
print(f"  stack    : {lang or 'unknown'} · risk {risk}")
print(f"  commands : build={commands['build']} · test={commands['test']} · lint={commands['lint']}")
if tentacle["open_latches"]:
    print(f"  open     : {', '.join(tentacle['open_latches'])}")
if register_dir:
    print(f"  registered → {os.path.relpath(register_dir)}/{tentacle['tentacle']}.json")
print(f"\n  → {verdict}")
print(f"  → tentacle config at .joadt/tentacle.json\n")

sys.exit(0 if operable else 1 if grip != "none" else 2)
