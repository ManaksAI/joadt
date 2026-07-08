import { useEffect, useRef, useState } from "react";
import Octopus from "./Octopus.jsx";
import { gripStatus, summarize } from "./lib.js";
import fallbackIndex from "../tentacles/index.json";

// When the control-plane server is down we still render the roster from the committed
// index (summary only — no describe detail, actions disabled).
const fallback = fallbackIndex.map((t) => ({
  tentacle: t.tentacle, grip: t.grip, operable: t.operable,
  stack: { language: t.language }, open_latches: [], hasLocal: false,
}));

export default function App() {
  const [tentacles, setTentacles] = useState(fallback);
  const [live, setLive] = useState(false);
  const [mode, setMode] = useState("local"); // "app" once the GitHub App is configured
  const [selected, setSelected] = useState(null);
  const [attaching, setAttaching] = useState(false);

  const loadRoster = async () => {
    // Prefer the GitHub App: repos the app is installed on ARE the tentacles. Merge in any
    // explored records (grip/stack/describe). Fall back to the local registry.
    try {
      const inst = await fetch("/api/installations").then((r) => r.json());
      if (inst.configured) {
        const explored = await fetch("/api/tentacles").then((r) => r.json()).catch(() => []);
        const byName = Object.fromEntries(explored.map((t) => [t.tentacle, t]));
        setTentacles(inst.repos.map((r) => ({
          ...(byName[r.tentacle] || {}), ...r, explored: Boolean(byName[r.tentacle]),
        })));
        setMode("app"); setLive(true); return;
      }
    } catch { /* fall through to local */ }
    try {
      const rows = await fetch("/api/tentacles").then((r) => r.json());
      setTentacles(rows.map((t) => ({ ...t, explored: true })));
      setMode("local"); setLive(true);
    } catch { /* keep the cached fallback */ }
  };

  useEffect(() => { loadRoster(); }, []);

  const stats = summarize(tentacles);
  const current = tentacles.find((t) => t.tentacle === selected);

  return (
    <div className="app">
      <header className="nav">
        <div className="brand"><Octopus size={26} /><span className="word">Joad<span className="t">T</span></span></div>
        <nav className="links"><span>Dashboard</span><span>Tentacles</span><span>Runs</span><span>Docs</span></nav>
      </header>

      <section className="hero">
        <Octopus size={116} />
        <h1>Joad<span className="t">T</span></h1>
        <p className="tag"><em>A tentacle into every app.</em> Plug one in — it self-onboards, then runs its own agentic SDLC.</p>
        <button className="cta" onClick={() => setAttaching(true)}>Attach a repo</button>
        {live && (
          <p className="mode">
            {mode === "app"
              ? "● connected to the GitHub App — installed repos are your tentacles"
              : "○ local mode — register the GitHub App to source tentacles from GitHub"}
          </p>
        )}
        {!live && <p className="hint">roster from cache · start the control plane (<code>npm run dev:server</code>) for describe + actions</p>}
      </section>

      <div className="sec">
        Tentacles · {stats.total} connected · {stats.operable} operable
        {stats.openLatches > 0 && <> · {stats.openLatches} open latch{stats.openLatches > 1 ? "es" : ""}</>}
      </div>
      <div className="grid">
        {tentacles.map((t) => (
          <button className="card" key={t.tentacle} onClick={() => setSelected(t.tentacle)}>
            <h3>{t.tentacle}</h3>
            <div className="meta">{t.stack?.language || (t.explored === false ? "installed" : "unknown")}</div>
            {t.explored === false
              ? <span className="pill">installed · not explored</span>
              : <span className={"pill " + (t.operable ? "ok" : t.grip === "none" ? "bad" : "warn")}>
                  {t.grip} grip · {gripStatus(t)}
                </span>}
            <div className="describe-hint">describe →</div>
          </button>
        ))}
        <button className="plug" onClick={() => setAttaching(true)}>+ Attach a repo</button>
      </div>

      {current && <Describe t={current} onClose={() => setSelected(null)}
        onDetached={() => { setSelected(null); loadRoster(); }} />}
      {attaching && <Attach onClose={() => setAttaching(false)} onDone={loadRoster} disabled={!live} />}
    </div>
  );
}

function Attach({ onClose, onDone, disabled }) {
  const [path, setPath] = useState("");
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const pre = useRef(null);

  useEffect(() => { if (pre.current) pre.current.scrollTop = pre.current.scrollHeight; }, [log]);

  const run = async () => {
    if (!path.trim()) return;
    setBusy(true); setDone(false); setLog("");
    try {
      const res = await fetch("/api/attach", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path.trim() }),
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done: d, value } = await reader.read();
        if (d) break;
        acc += dec.decode(value, { stream: true });
        setLog(acc.replace(/\n?\[\[done \d+\]\]\n?/g, ""));
      }
    } catch (e) {
      setLog((l) => l + `\nerror: ${e}`);
    }
    setBusy(false); setDone(true);
    onDone();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Attach a repo</h2>
          <button className="x" onClick={onClose} aria-label="close">×</button>
        </div>
        <p className="dim">A tentacle explores the repo, secures its latches, and registers it with the control plane.</p>
        {disabled && <p className="dim">start the control plane (<code>npm run dev:server</code>) to attach.</p>}
        <p className="dim">Give a local path, or a git URL — a URL is cloned into a workspace first.</p>
        <div className="attach-row">
          <input className="path" placeholder="/abs/path/to/repo  or  https://github.com/org/repo" value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && run()} disabled={disabled || busy} />
          <button className="act" onClick={run} disabled={disabled || busy || !path.trim()}>
            {busy ? "attaching…" : "attach"}
          </button>
        </div>
        {log && (
          <pre className="progress" ref={pre}>{log}</pre>
        )}
        {done && <p className="dim">done — the roster has been refreshed.</p>}
      </div>
    </div>
  );
}

function Describe({ t, onClose, onDetached }) {
  const [running, setRunning] = useState(null);
  const [result, setResult] = useState(null);

  const detach = async () => {
    if (!window.confirm(`Detach ${t.tentacle} completely? This removes it from the control plane.`)) return;
    try { await fetch(`/api/tentacles/${t.tentacle}`, { method: "DELETE" }); } catch (e) { /* ignore */ }
    onDetached();
  };

  const run = async (action) => {
    setRunning(action); setResult(null);
    try {
      const r = await fetch(`/api/tentacles/${t.tentacle}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setResult(await r.json());
    } catch (e) {
      setResult({ error: String(e) });
    }
    setRunning(null);
  };

  const explore = async () => {
    setRunning("explore"); setResult(null);
    try {
      const res = await fetch("/api/attach", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: t.remote }),
      });
      const text = await res.text();
      setResult({ output: text.replace(/\n?\[\[done \d+\]\]\n?/g, ""), ok: true });
    } catch (e) { setResult({ error: String(e), ok: false }); }
    setRunning(null);
    onDetached(); // refresh the roster — it now carries grip/stack; the card updates
  };

  const List = ({ items, empty }) =>
    items && items.length ? <ul>{items.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="dim">{empty}</p>;

  // Installed via the App but not yet explored → offer to explore, not the full detail.
  if (t.explored === false) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div><h2>{t.tentacle}</h2><div className="dim mono">{t.remote || "—"}</div></div>
          <button className="x" onClick={onClose} aria-label="close">×</button>
        </div>
        <span className="pill">installed · not explored</span>
        <h4>Explore</h4>
        <p className="dim">Installed via the GitHub App but not yet mapped. Explore it to detect its stack, latches, grip, architecture, and toolchain.</p>
        <div className="actions">
          <button className="act" disabled={running === "explore"} onClick={explore}>
            {running === "explore" ? "exploring…" : "explore this repo"}
          </button>
        </div>
        {result && <pre className="progress">{result.output || result.error || ""}</pre>}
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>{t.tentacle}</h2>
          <div className="dim mono">{t.remote || "—"}</div>
        </div>
        <button className="x" onClick={onClose} aria-label="close">×</button>
      </div>

      <span className={"pill " + (t.operable ? "ok" : t.grip === "none" ? "bad" : "warn")}>
        {t.grip} grip · {gripStatus(t)}
      </span>

      <h4>Architecture</h4>
      {t.architecture
        ? <pre className="arch">{t.architecture}</pre>
        : <List items={t.entrypoints} empty="no entrypoints detected" />}
      {t.entrypoints?.length ? <p className="dim mono ent">entrypoints · {t.entrypoints.join(" · ")}</p> : null}

      <h4>Tech stack</h4>
      <p>{[t.stack?.language, t.stack?.package_manager].filter(Boolean).join(" · ") || "unknown"}
        {t.stack?.frameworks?.length ? " · " + t.stack.frameworks.join(", ") : ""}</p>
      {t.dependencies?.length ? <p className="dim mono deps">{t.dependencies.join(" · ")}</p> : null}

      <h4>Toolchain</h4>
      {t.toolchain?.required?.length ? (
        <p>
          {t.toolchain.required.map((tool) => (
            <span key={tool} className={"tc " + (t.toolchain.missing?.includes(tool) ? "tc-missing" : "tc-ok")}>{tool}</span>
          ))}
          {t.toolchain.missing?.length
            ? <span className="dim"> — missing; JoadT must provision it to build/test</span>
            : <span className="dim"> — available</span>}
        </p>
      ) : <p className="dim">no toolchain resolved</p>}

      <h4>Functionalities</h4>
      {t.functionalities
        ? <p>{t.functionalities}</p>
        : <p className="dim">not analyzed yet — run the deep exploration pass</p>}
      <List items={t.conventions} empty="" />

      {t.open_latches?.length ? (<><h4>Open latches</h4><List items={t.open_latches} empty="" /></>) : null}

      <h4>Actions</h4>
      {!t.hasLocal && <p className="dim">no local checkout registered — actions unavailable</p>}
      <div className="actions">
        {["build", "test", "lint"].map((a) => (
          <button key={a} className="act" disabled={!t.hasLocal || running} onClick={() => run(a)}>
            {running === a ? "running…" : a}
          </button>
        ))}
      </div>
      {result && (
        <div className={"output " + (result.ok ? "pass" : "fail")}>
          <div className="output-head">{result.error ? "error" : `${result.action} · exit ${result.code} · ${result.ok ? "pass" : "fail"}`}</div>
          <pre>{result.error || result.output}</pre>
        </div>
      )}

      <div className="detach-row">
        <button className="detach" onClick={detach}>detach repo</button>
      </div>
    </div>
  );
}
