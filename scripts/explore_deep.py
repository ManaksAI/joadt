#!/usr/bin/env python3
"""JoadT deep exploration pass.

Layers judgment on top of the deterministic explorer. Reads .joadt/profile.json + the
file tree and asks Claude for what a scan can't see: implicit/undeclared dependencies,
the framework's conventions, hidden coupling and risks, a risk read, and a PRIORITIZED
prep plan for the missing latches. Enriches the profile in place (profile["deep"]).

Pattern mirrors triage.py / plan.py (Claude, adaptive thinking, structured JSON output).
Runs only when an API key + credits are available — the deterministic core always runs
first, so this is purely additive.

Env in: ANTHROPIC_API_KEY, MODEL (optional, default claude-sonnet-4-6).
Usage:  python scripts/explore_deep.py [repo_path]
"""
import json
import os
import subprocess
import sys

import anthropic

repo = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
os.chdir(repo)
MODEL = os.environ.get("MODEL", "claude-sonnet-4-6")

prof_path = ".joadt/profile.json"
if not os.path.exists(prof_path):
    print("no .joadt/profile.json — run `python scripts/explore.py` first.")
    sys.exit(2)
profile = json.load(open(prof_path))

try:
    files = subprocess.check_output(["git", "ls-files"], text=True).splitlines()
except Exception:
    files = []
tree = "\n".join(files[:500]) or "(empty)"

SCHEMA = {
    "type": "object",
    "properties": {
        "implicit_dependencies": {"type": "array", "items": {"type": "string"}},
        "conventions": {"type": "array", "items": {"type": "string"}},
        "hidden_risks": {"type": "array", "items": {"type": "string"}},
        "risk_level": {"type": "string", "enum": ["low", "medium", "high"]},
        "prep_plan": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "latch": {"type": "string"},
                    "action": {"type": "string"},
                    "priority": {"type": "string", "enum": ["now", "soon", "later"]},
                },
                "required": ["latch", "action", "priority"],
                "additionalProperties": False,
            },
        },
        "summary": {"type": "string"},
    },
    "required": ["implicit_dependencies", "conventions", "hidden_risks",
                 "risk_level", "prep_plan", "summary"],
    "additionalProperties": False,
}

PROMPT = f"""You are the deep exploration pass of JoadT — an agentic dev platform onboarding a repo.
A deterministic scan already produced this App Profile:

{json.dumps(profile, indent=2)}

REPOSITORY FILES (truncated):
{tree}

Add the judgment the scan can't. Return structured output:
- implicit_dependencies: real dependencies NOT in the manifest (runtime services, env vars, external
  APIs, system binaries, sibling repos) that the code clearly relies on.
- conventions: how this codebase does things (structure, naming, patterns) a JoadT agent must follow.
- hidden_risks: coupling, fragile spots, or footguns that make automated change risky here.
- risk_level: overall blast radius of getting a change wrong.
- prep_plan: for each MISSING latch (see profile.missing_latches) and anything else you'd prepare,
  a concrete action and a priority (now/soon/later). Order by what most improves JoadT's grip.
- summary: 2-3 sentences a human onboarding this repo should read first.

Ground every claim in the actual files. Do not restate what the deterministic profile already found."""

client = anthropic.Anthropic()
resp = client.messages.create(
    model=MODEL,
    max_tokens=4000,
    thinking={"type": "adaptive"},
    output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
    messages=[{"role": "user", "content": PROMPT}],
)
deep = json.loads(next(b.text for b in resp.content if b.type == "text"))
deep["model"] = MODEL

profile["deep"] = deep
with open(prof_path, "w") as f:
    json.dump(profile, f, indent=2)


def md(items):
    return "\n".join(f"    - {x}" for x in items) if items else "    - (none)"


print(f"\n  JoadT deep exploration — {profile['repo']}  (model {MODEL})")
print(f"\n  {deep['summary']}\n")
print(f"  risk: {deep['risk_level']}")
print("\n  implicit dependencies:\n" + md(deep["implicit_dependencies"]))
print("\n  conventions:\n" + md(deep["conventions"]))
print("\n  hidden risks:\n" + md(deep["hidden_risks"]))
print("\n  prep plan (grip-first):")
for step in deep["prep_plan"]:
    print(f"    [{step['priority']:5}] {step['latch']:20} {step['action']}")
print("\n  → enriched profile written to .joadt/profile.json\n")
