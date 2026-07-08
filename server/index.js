// JoadT control-plane server. Serves the tentacle roster and runs an app's dev/test
// pipeline steps (build / test / lint) in its local repo, on demand from the UI.
import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appConfigured, installedRepos } from "./github.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REG = join(ROOT, "tentacles");
const PORT = process.env.PORT || 8790;
const ACTIONS = ["build", "test", "lint"];

const localMap = () => {
  const p = join(REG, ".local.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
};
const records = () =>
  readdirSync(REG)
    .filter((f) => f.endsWith(".json") && f !== "index.json" && !f.startsWith("."))
    .map((f) => JSON.parse(readFileSync(join(REG, f), "utf8")));

const WORKSPACES = join(ROOT, ".workspaces"); // JoadT-managed clones (git-ignored)

const rebuildIndex = () => {
  const index = records().map((t) => ({
    tentacle: t.tentacle, grip: t.grip, operable: t.operable,
    language: (t.stack || {}).language, open_latches: (t.open_latches || []).length,
    attached_at: t.attached_at,
  }));
  writeFileSync(join(REG, "index.json"), JSON.stringify(index, null, 2));
};

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

const app = express();
app.use(cors());
// keep the raw body so we can verify GitHub webhook signatures
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

// installed repos = the tentacle roster, straight from the GitHub App (no master, no callers).
// Falls back to { configured: false } until the app is registered, so the UI keeps working.
app.get("/api/installations", async (_req, res) => {
  if (!appConfigured()) return res.json({ configured: false, repos: [] });
  try {
    res.json({ configured: true, repos: await installedRepos() });
  } catch (e) {
    res.status(500).json({ configured: true, error: String(e), repos: [] });
  }
});

// GitHub App webhook — installs, issues, PRs. Verified, then (later) routed to the orchestrator.
app.post("/api/webhook", (req, res) => {
  if (WEBHOOK_SECRET) {
    const sig = req.get("x-hub-signature-256") || "";
    const digest = "sha256=" + createHmac("sha256", WEBHOOK_SECRET)
      .update(req.rawBody || Buffer.from("")).digest("hex");
    const ok = sig.length === digest.length &&
      timingSafeEqual(Buffer.from(sig), Buffer.from(digest));
    if (!ok) return res.status(401).json({ error: "bad signature" });
  }
  const event = req.get("x-github-event");
  const b = req.body || {};
  console.log(`[webhook] ${event} ${b.action || ""} · ${b.repository?.full_name || b.installation?.account?.login || ""}`);
  // TODO(next): route installation/installation_repositories → refresh roster;
  //             issues(labeled)/pull_request → drive the orchestrator on that repo.
  res.json({ ok: true });
});

// the roster — full records, flagged with whether a local repo is available to run actions
app.get("/api/tentacles", (_req, res) => {
  const local = localMap();
  res.json(records().map((t) => ({ ...t, hasLocal: Boolean(local[t.tentacle]) })));
});

// run one finite pipeline step (build|test|lint) in the tentacle's local repo
app.post("/api/tentacles/:name/run", (req, res) => {
  const action = String((req.body || {}).action || "");
  const rec = records().find((t) => t.tentacle === req.params.name);
  if (!rec) return res.status(404).json({ error: "unknown tentacle" });
  if (!ACTIONS.includes(action)) return res.status(400).json({ error: `action must be one of ${ACTIONS}` });
  const cmd = (rec.commands || {})[action];
  const cwd = localMap()[rec.tentacle];
  if (!cmd) return res.status(400).json({ error: `no ${action} command for ${rec.tentacle}` });
  if (!cwd) return res.status(400).json({ error: "no local checkout registered for this tentacle" });

  const child = spawn(cmd, { cwd, shell: true });
  let out = "";
  const grab = (d) => (out += d.toString());
  child.stdout.on("data", grab);
  child.stderr.on("data", grab);
  child.on("error", (e) => res.status(500).json({ error: String(e) }));
  child.on("close", (code) =>
    res.json({ action, cmd, cwd, code, ok: code === 0, output: out.slice(-12000) })
  );
});

// attach a repo — a local path OR a git URL (cloned first) — and STREAM progress to the UI
app.post("/api/attach", (req, res) => {
  const input = String((req.body || {}).path || "").trim();
  if (!input) return res.status(400).json({ error: "path or git url required" });
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  const onboard = (localPath) => {
    const child = spawn("python3",
      [join(ROOT, "scripts", "attach.py"), localPath, "--prep", "--register", REG], { cwd: ROOT });
    child.stdout.on("data", (d) => res.write(d));
    child.stderr.on("data", (d) => res.write(d));
    child.on("error", (e) => { res.write(`\nerror: ${e}\n`); res.end(); });
    child.on("close", (code) => { res.write(`\n[[done ${code}]]\n`); res.end(); });
  };

  const isUrl = /^(https?:\/\/|git@)/.test(input) || input.endsWith(".git");
  if (!isUrl) {
    if (!existsSync(input)) { res.write(`  path not found: ${input}\n[[done 1]]\n`); return res.end(); }
    return onboard(input);
  }

  // git URL → clone into a JoadT-managed workspace, then onboard the clone
  const name = input.replace(/\.git$/, "").split("/").pop() || "repo";
  const dest = join(WORKSPACES, name);
  if (existsSync(dest)) {
    res.write(`  workspace exists → reusing .workspaces/${name}\n\n`);
    return onboard(dest);
  }
  res.write(`  cloning ${input}\n  → .workspaces/${name}\n\n`);
  const clone = spawn("git", ["clone", "--depth", "1", input, dest]);
  clone.stdout.on("data", (d) => res.write(d));
  clone.stderr.on("data", (d) => res.write(d)); // git clone reports progress on stderr
  clone.on("error", (e) => { res.write(`\nclone error: ${e}\n[[done 1]]\n`); res.end(); });
  clone.on("close", (code) => {
    if (code !== 0) { res.write(`\nclone failed (exit ${code})\n[[done ${code}]]\n`); return res.end(); }
    res.write(`\n  cloned. onboarding…\n`);
    onboard(dest);
  });
});

// detach a repo — remove it from the control plane completely
app.delete("/api/tentacles/:name", (req, res) => {
  const name = req.params.name;
  const rec = join(REG, `${name}.json`);
  if (!existsSync(rec)) return res.status(404).json({ error: "unknown tentacle" });
  unlinkSync(rec);
  // drop it from the local-path map; remove the clone dir only if JoadT created it
  const lp = join(REG, ".local.json");
  let removedClone = false;
  if (existsSync(lp)) {
    const m = JSON.parse(readFileSync(lp, "utf8"));
    const p = m[name];
    delete m[name];
    writeFileSync(lp, JSON.stringify(m, null, 2));
    if (p && p.startsWith(WORKSPACES)) {
      try { rmSync(p, { recursive: true, force: true }); removedClone = true; } catch {}
    }
  }
  rebuildIndex();
  res.json({ ok: true, detached: name, removedClone });
});

app.listen(PORT, () => console.log(`JoadT control plane on http://localhost:${PORT}`));
