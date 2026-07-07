import Octopus from "./Octopus.jsx";
import { gripStatus, summarize } from "./lib.js";
import registry from "../tentacles/index.json";

export default function App() {
  const stats = summarize(registry);
  return (
    <div className="app">
      <header className="nav">
        <div className="brand">
          <Octopus size={26} />
          <span className="word">Joad<span className="t">T</span></span>
        </div>
        <nav className="links"><span>Dashboard</span><span>Tentacles</span><span>Runs</span><span>Docs</span></nav>
      </header>

      <section className="hero">
        <Octopus size={116} />
        <h1>Joad<span className="t">T</span></h1>
        <p className="tag"><em>A tentacle into every app.</em> Plug one in — it self-onboards, then runs its own agentic SDLC. Everywhere your code is.</p>
        <button className="cta">Attach a repo</button>
      </section>

      <section>
        <div className="sec">
          Tentacles · {stats.total} connected · {stats.operable} operable
          {stats.openLatches > 0 && <> · {stats.openLatches} open latch{stats.openLatches > 1 ? "es" : ""}</>}
        </div>
        <div className="grid">
          {registry.map((t) => (
            <div className="card" key={t.tentacle}>
              <h3>{t.tentacle}</h3>
              <div className="meta">{t.language || "unknown"}</div>
              <span className={"pill " + (t.operable ? "ok" : t.grip === "none" ? "bad" : "warn")}>
                {t.grip} grip · {gripStatus(t)}
              </span>
              {t.open_latches > 0 && (
                <div className="latch">{t.open_latches} open latch{t.open_latches > 1 ? "es" : ""}</div>
              )}
            </div>
          ))}
          <div className="plug">+ Attach a repo</div>
        </div>
      </section>
    </div>
  );
}
