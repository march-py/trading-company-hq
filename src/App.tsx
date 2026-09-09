import { useEffect, useState } from "react";

type Health = {
  status: "ok";
  app: string;
  environment: "dev" | "prod";
  time: string;
};

export default function App() {
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
        if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
      });

    return () => controller.abort();
  }, []);

  const status = failed
    ? "SYSTEM CHECK FAILED"
    : health
      ? `${health.environment.toUpperCase()} ONLINE`
      : "CONNECTING";

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">TC</span>
          <div>
            <p className="eyebrow">PRIVATE OPERATING SYSTEM</p>
            <h1>Trading Company HQ</h1>
          </div>
        </div>
        <div className={`health ${failed ? "health--error" : ""}`} role="status">
          <span className="health-dot" aria-hidden="true" />
          {status}
        </div>
      </header>

      <section className="hero">
        <p className="stage">S00.2 / LOCAL APP FOUNDATION</p>
        <h2>Foundation online.</h2>
        <p>The local application and Worker API boundary are running with explicit DEV and PROD configuration.</p>
      </section>

      <section className="status-grid" aria-label="Foundation status">
        <article>
          <span>APPLICATION</span>
          <strong>READY</strong>
          <small>React + Cloudflare Worker</small>
        </article>
        <article>
          <span>ENVIRONMENT</span>
          <strong>{health?.environment.toUpperCase() ?? "DEV"}</strong>
          <small>Production isolated</small>
        </article>
        <article>
          <span>EXECUTION</span>
          <strong>MANUAL</strong>
          <small>V1 safety boundary</small>
        </article>
      </section>
    </main>
  );
}
