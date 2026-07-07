import { useEffect, useState } from "react";
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
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch("/api/tentacles")
      .then((r) => r.json())
      .then((rows) => { setTentacles(rows); setLive(true); })
      .catch(() => {});
  }, []);

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
            <div className="meta">{t.stack?.language || "unknown"}</div>
            <span className={"pill " + (t.operable ? "ok" : t.grip === "none" ? "bad" : "warn")}>
              {t.grip} grip · {gripStatus(t)}
            </span>
            <div className="describe-hint">describe →</div>
          </button>
        ))}
        <div className="plug">+ Attach a repo</div>
      </div>

      {current && <Describe t={current} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Describe({ t, onClose }) {
  const [running, setRunning] = useState(null);
  const [result, setResult] = useState(null);

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

  const List = ({ items, empty }) =>
    items && items.length ? <ul>{items.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="dim">{empty}</p>;

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
    </div>
  );
}
