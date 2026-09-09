import { useEffect, useState } from "react";
import { Icon } from "./components/Icon";
import { StatusBadge } from "./components/StatusBadge";
import { AppShell, CardShell, PageScaffold, PanelShell, TableShell, type NavGroup } from "./components/layout";
import { CommandPalette, InstrumentDrawer } from "./components/overlays";
import { StatePanel } from "./components/states";

type Health = {
  status: "ok";
  app: string;
  environment: "dev" | "prod";
  time: string;
};

const navigation: NavGroup[] = [
  {
    label: "Headquarters",
    items: [
      { id: "lobby", label: "Lobby", stage: "S01", icon: "home", available: true },
      { id: "market-data", label: "Market data", stage: "S03", icon: "database" },
    ],
  },
  {
    label: "Decision desks",
    items: [
      { id: "research", label: "Research", stage: "S04–S06", icon: "layers" },
      { id: "trading", label: "Trading", stage: "S07–S10", icon: "chart" },
      { id: "portfolio", label: "Portfolio", stage: "S11–S13", icon: "briefcase" },
    ],
  },
  {
    label: "Control room",
    items: [
      { id: "risk", label: "Risk & oversight", stage: "S14–S15", icon: "shield" },
      { id: "automation", label: "Automation", stage: "S16–S17", icon: "activity" },
      { id: "settings", label: "System settings", stage: "S18", icon: "settings" },
    ],
  },
];

const moduleRunway = [
  { name: "Market data", stage: "S03", purpose: "Sources and instrument context", icon: "database" as const },
  { name: "Research", stage: "S04–S06", purpose: "Ideas, evidence, and decision briefs", icon: "layers" as const },
  { name: "Trading", stage: "S07–S10", purpose: "Orders and execution workflows", icon: "chart" as const },
  { name: "Portfolio", stage: "S11–S13", purpose: "Positions and performance context", icon: "briefcase" as const },
];

function App() {
  const [activeItem, setActiveItem] = useState("lobby");
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
        setDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const healthTone = failed ? "error" : health ? "success" : "normal";
  const healthLabel = failed ? "SYSTEM CHECK FAILED" : health ? `${health.environment.toUpperCase()} ONLINE` : "CONNECTING";

  return (
    <AppShell activeItem={activeItem} navigation={navigation} onNavigate={setActiveItem}>
      <PageScaffold
        eyebrow="HQ / LOBBY"
        title="Good morning."
        description="A permanent operating frame for the decisions, controls, and systems that will come online as the company grows."
        status={<StatusBadge tone={healthTone} label={healthLabel} />}
        actions={
          <div className="header-actions">
            <button className="button button--quiet" type="button" onClick={() => setPaletteOpen(true)}><Icon name="search" /><span>Commands</span><kbd>⌘ K</kbd></button>
            <button className="icon-button" type="button" onClick={() => setDrawerOpen(true)} aria-label="Open instrument drawer"><Icon name="panel-right" /></button>
          </div>
        }
      >
        <section className="lobby-summary" aria-label="Headquarters summary">
          <CardShell eyebrow="OPERATING POSTURE" title="Foundation is ready" detail="S01.2">
            <p className="card-copy">The visual language and permanent desktop frame are established. Business modules remain intentionally dormant.</p>
            <div className="signal-line">
              <StatusBadge tone="success" label="SYSTEM HEALTHY" />
              <span>Last verified in this session</span>
            </div>
          </CardShell>

          <CardShell eyebrow="RELEASE TRACK" title="Interface foundation" detail="2 / 3">
            <div className="progress-track" aria-label="Interface foundation: two of three chunks complete">
              <span className="progress-fill" />
            </div>
            <div className="milestone-row">
              <span><Icon name="check" size="sm" /> Visual system</span>
              <span><Icon name="check" size="sm" /> HQ shell</span>
              <span className="milestone-muted"><Icon name="circle" size="sm" /> Responsive</span>
            </div>
          </CardShell>
        </section>

        <PanelShell eyebrow="PERMANENT INSERTION POINTS" title="Module runway" detail="S03–S13" className="module-panel">
          <div className="module-grid">
            {moduleRunway.map((module) => (
              <article className="module-card" key={module.name}>
                <span className="module-icon"><Icon name={module.icon} /></span>
                <div>
                  <p className="module-stage">{module.stage}</p>
                  <h3>{module.name}</h3>
                  <p>{module.purpose}</p>
                </div>
                <span className="reserved-label">RESERVED</span>
              </article>
            ))}
          </div>
        </PanelShell>

        <TableShell eyebrow="SHARED TABLE SCAFFOLD" title="Build sequence" detail="STRUCTURE ONLY" label="Future module insertion sequence">
          <div className="shell-table-row shell-table-row--header" role="row">
            <span role="columnheader">AREA</span><span role="columnheader">STAGE</span><span role="columnheader">INSERTION POINT</span><span role="columnheader">STATE</span>
          </div>
          <div className="shell-table-row" role="row">
            <strong role="cell">Data foundation</strong><span role="cell">S02–S03</span><span role="cell">Market data</span><span role="cell"><StatusBadge tone="normal" label="PLANNED" /></span>
          </div>
          <div className="shell-table-row" role="row">
            <strong role="cell">Decision workflow</strong><span role="cell">S04–S10</span><span role="cell">Research + Trading</span><span role="cell"><StatusBadge tone="normal" label="PLANNED" /></span>
          </div>
          <div className="shell-table-row" role="row">
            <strong role="cell">Oversight</strong><span role="cell">S11–S18</span><span role="cell">Portfolio + Control room</span><span role="cell"><StatusBadge tone="normal" label="PLANNED" /></span>
          </div>
        </TableShell>

        <PanelShell eyebrow="REUSABLE APPLICATION STATES" title="State foundation" detail="S01.3" className="state-foundation">
          <div className="state-grid">
            <StatePanel kind="loading" title="Loading context" message="Preserves layout while a bounded request is in flight." />
            <StatePanel kind="error" title="Context unavailable" message="Explains the failure and keeps recovery close." action={<button className="text-button" type="button">Try again</button>} />
            <StatePanel kind="empty" title="Nothing here yet" message="Names what belongs here and how to begin." action={<button className="text-button" type="button">View guidance</button>} />
          </div>
        </PanelShell>
      </PageScaffold>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onOpenDrawer={() => setDrawerOpen(true)} />
      <InstrumentDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </AppShell>
  );
}

export default App;
