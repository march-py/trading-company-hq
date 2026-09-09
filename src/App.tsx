import { useEffect, useState } from "react";
import { Icon, type IconName } from "./components/Icon";
import { StatusBadge, type StatusTone } from "./components/StatusBadge";

type Health = {
  status: "ok";
  app: string;
  environment: "dev" | "prod";
  time: string;
};

const statusTones: StatusTone[] = ["normal", "active", "success", "warning", "error", "disabled", "unknown"];
const iconNames: IconName[] = ["activity", "arrow-up", "arrow-down", "layers", "shield", "warning"];

function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Health check failed");
        return response.json() as Promise<Health>;
      })
      .then(setHealth)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailed(true);
      });

    return () => controller.abort();
  }, []);

  const healthState = failed ? "error" : health ? "online" : "connecting";
  const healthLabel = failed ? "SYSTEM CHECK FAILED" : health ? `${health.environment.toUpperCase()} ONLINE` : "CONNECTING";

  return (
    <main className="specimen">
      <header className="specimen-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">TC</span>
          <div>
            <p className="micro-label">TRADING COMPANY</p>
            <h1>Visual system specimen</h1>
          </div>
        </div>
        <span className={`health health--${healthState}`} aria-live="polite">
          <span className="health-dot" aria-hidden="true" />
          {healthLabel}
        </span>
      </header>

      <section className="intro" aria-labelledby="specimen-title">
        <p className="micro-label">S01.1 / CANONICAL DESIGN LANGUAGE</p>
        <h2 id="specimen-title">Precision<br />without noise.</h2>
        <p className="intro-copy">
          A restrained, dark-first system for dense financial decisions: quiet surfaces,
          explicit states, and numbers designed to be compared at a glance.
        </p>
      </section>

      <section className="specimen-grid" aria-label="Visual system samples">
        <article className="panel panel--type">
          <div className="panel-heading">
            <p className="micro-label">01 / TYPOGRAPHY</p>
            <span className="panel-note">UI + DATA</span>
          </div>
          <div className="type-sample">
            <p className="display-sample">Aa</p>
            <div>
              <p className="heading-sample">Signal over spectacle</p>
              <p className="body-sample">Hierarchy stays legible while the interface remains calm.</p>
              <p className="data-sample">1,284.32&nbsp;&nbsp;+2.47%</p>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <p className="micro-label">02 / SURFACES</p>
            <span className="panel-note">DARK FIRST</span>
          </div>
          <div className="swatch-row" aria-label="Surface color scale">
            {["canvas", "surface-1", "surface-2", "surface-3"].map((name) => (
              <div className={`swatch swatch--${name}`} key={name}>
                <span>{name.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel--wide">
          <div className="panel-heading">
            <p className="micro-label">03 / FINANCIAL NUMERICS</p>
            <span className="panel-note">TABULAR + DIRECTIONAL</span>
          </div>
          <div className="market-table" role="table" aria-label="Financial number styles">
            <div className="market-row market-row--header" role="row">
              <span role="columnheader">INSTRUMENT</span><span role="columnheader">LAST</span><span role="columnheader">CHANGE</span><span role="columnheader">EXPOSURE</span>
            </div>
            <div className="market-row" role="row">
              <strong role="cell">SPX</strong><span role="cell">5,621.44</span><span className="number-positive" role="cell">+0.82%</span><span role="cell">$2.40M</span>
            </div>
            <div className="market-row" role="row">
              <strong role="cell">EURUSD</strong><span role="cell">1.1048</span><span className="number-negative" role="cell">−0.31%</span><span role="cell">$860K</span>
            </div>
            <div className="market-row" role="row">
              <strong role="cell">UST 10Y</strong><span role="cell">3.676%</span><span className="number-neutral" role="cell">0.00%</span><span role="cell">$1.18M</span>
            </div>
          </div>
        </article>

        <article className="panel panel--wide">
          <div className="panel-heading">
            <p className="micro-label">04 / STATUS LANGUAGE</p>
            <span className="panel-note">COLOR + ICON + LABEL</span>
          </div>
          <div className="status-list">
            {statusTones.map((tone) => <StatusBadge key={tone} tone={tone} />)}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <p className="micro-label">05 / ICON DIRECTION</p>
            <span className="panel-note">1.6 PX STROKE</span>
          </div>
          <div className="icon-list">
            {iconNames.map((name) => (
              <span className="icon-sample" key={name} title={name}>
                <Icon name={name} size="lg" label={name} />
              </span>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <p className="micro-label">06 / CONTROL STATES</p>
            <span className="panel-note">VISIBLE FOCUS</span>
          </div>
          <div className="control-list">
            <button className="button button--primary" type="button">Review signal</button>
            <button className="button button--secondary" type="button">Dismiss</button>
            <button className="button" type="button" disabled>Unavailable</button>
          </div>
          <p className="accessibility-note">Keyboard focus uses a persistent high-contrast ring. Status never relies on color alone.</p>
        </article>
      </section>

      <footer className="specimen-footer">
        <span>S01.1 / VISUAL SYSTEM</span>
        <span>8 PT RHYTHM · 10–14 PX RADII · 40 PX CONTROLS</span>
      </footer>
    </main>
  );
}

export default App;
