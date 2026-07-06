#!/usr/bin/env node
// Maps changed/implicated files to the sandbox slice that OWNS them, so an
// integration-test failure can be routed to the right sandbox. Dependency-free (Node 18+).
//
// Usage:
//   node scripts/triage-owner.mjs [--map <path>] <file> [<file> ...]
//
// Map file (default .wave/ownership.json, emitted by the Planner) shape:
//   {
//     "slices": [ { "name": "...", "branch": "...", "owns": ["glob", ...] }, ... ],
//     "frozen": ["package.json", "package-lock.json", ...]
//   }
//
// For each file it prints the owning slice, or FROZEN (reconcile separately), or UNOWNED
// (with a git hint for the last commit that touched it). Exit 1 if any file is UNOWNED.

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
let mapPath = ".wave/ownership.json";
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--map") mapPath = args[++i];
  else files.push(args[i]);
}

if (!files.length) {
  console.error("usage: node scripts/triage-owner.mjs [--map <path>] <file> [<file> ...]");
  process.exit(2);
}
if (!existsSync(mapPath)) {
  console.error(`ownership map not found: ${mapPath} (the Planner emits this per wave)`);
  process.exit(2);
}

const map = JSON.parse(readFileSync(mapPath, "utf8"));

// Minimal glob → RegExp: ** = any chars (incl /), * = any chars except /.
function globToRe(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; }
      else re += "[^/]*";
    } else if ("/.+^${}()|[]\\".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp("^" + re + "$");
}

const slices = (map.slices ?? []).map((s) => ({
  ...s,
  res: (s.owns ?? []).map(globToRe),
}));
const frozenRes = (map.frozen ?? []).map(globToRe);

function gitHint(file) {
  try {
    return execSync(`git log -1 --oneline -- "${file}"`, { encoding: "utf8" }).trim() || "(no history)";
  } catch {
    return "(git unavailable)";
  }
}

let unowned = 0;
for (const file of files) {
  if (frozenRes.some((re) => re.test(file))) {
    console.log(`${file}  →  FROZEN  (shared surface — reconcile in a sequential step, not in a sandbox)`);
    continue;
  }
  const owner = slices.find((s) => s.res.some((re) => re.test(file)));
  if (owner) {
    console.log(`${file}  →  ${owner.name}  [${owner.branch}]`);
  } else {
    unowned++;
    console.log(`${file}  →  UNOWNED  — no slice claims it; last touched by ${gitHint(file)}`);
  }
}

process.exit(unowned ? 1 : 0);
