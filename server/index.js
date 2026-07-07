// JoadT control-plane server. Serves the tentacle roster and runs an app's dev/test
// pipeline steps (build / test / lint) in its local repo, on demand from the UI.
import express from "express";
import cors from "cors";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

const app = express();
app.use(cors());
app.use(express.json());

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

// attach a repo — runs the onboarding pipeline and STREAMS its progress to the UI
app.post("/api/attach", (req, res) => {
  const repoPath = String((req.body || {}).path || "").trim();
  if (!repoPath) return res.status(400).json({ error: "path required" });
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  const child = spawn(
    "python3",
    [join(ROOT, "scripts", "attach.py"), repoPath, "--prep", "--register", REG],
    { cwd: ROOT }
  );
  child.stdout.on("data", (d) => res.write(d));
  child.stderr.on("data", (d) => res.write(d));
  child.on("error", (e) => { res.write(`\nerror: ${e}\n`); res.end(); });
  child.on("close", (code) => { res.write(`\n[[done ${code}]]\n`); res.end(); });
});

app.listen(PORT, () => console.log(`JoadT control plane on http://localhost:${PORT}`));
