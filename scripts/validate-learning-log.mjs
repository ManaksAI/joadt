#!/usr/bin/env node
// Validates docs/learning-log/ structure. Dependency-free (Node 18+).
//
// Checks, for every entries/*.md:
//   - has YAML-ish front matter delimited by --- ... ---
//   - front matter carries: date (YYYY-MM-DD), slug, tags, requirement
//   - body has the five required section headings
//   - INDEX.md links to it (one line per entry)
// And that INDEX.md has no links to entries that don't exist.
//
// Exit 0 = clean, 1 = problems found. Safe to wire into `make lint` / CI.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logDir = join(root, "docs", "learning-log");
const entriesDir = join(logDir, "entries");
const indexPath = join(logDir, "INDEX.md");

const REQUIRED_FIELDS = ["date", "slug", "tags", "requirement"];
const REQUIRED_SECTIONS = ["Approach", "Bottleneck", "How overcome", "Alternatives", "Outcome"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const errors = [];
const err = (m) => errors.push(m);

if (!existsSync(entriesDir)) err(`missing directory: docs/learning-log/entries/`);
if (!existsSync(indexPath)) err(`missing file: docs/learning-log/INDEX.md`);

const indexText = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
const entryFiles = existsSync(entriesDir)
  ? readdirSync(entriesDir).filter((f) => f.endsWith(".md"))
  : [];

for (const file of entryFiles) {
  const text = readFileSync(join(entriesDir, file), "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) {
    err(`${file}: no front matter (--- ... --- block)`);
  } else {
    const block = fm[1];
    for (const field of REQUIRED_FIELDS) {
      const m = block.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
      if (!m) err(`${file}: front matter missing "${field}"`);
      else if (field === "date" && !DATE_RE.test(m[1].trim()))
        err(`${file}: date "${m[1].trim()}" is not YYYY-MM-DD`);
    }
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!new RegExp(`^##\\s+${section}\\s*$`, "m").test(text))
      err(`${file}: missing "## ${section}" section`);
  }
  if (!indexText.includes(`entries/${file}`))
    err(`${file}: not linked from INDEX.md`);
}

// Reverse check: every INDEX link points to a real entry file.
for (const m of indexText.matchAll(/entries\/([\w.-]+\.md)/g)) {
  if (!entryFiles.includes(m[1])) err(`INDEX.md links missing entry: entries/${m[1]}`);
}

if (errors.length) {
  console.error(`learning-log: ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`learning-log: OK (${entryFiles.length} entr${entryFiles.length === 1 ? "y" : "ies"} valid)`);
