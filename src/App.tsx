import { useEffect, useState } from "react";
import { Icon } from "./components/Icon";
import { StatusBadge } from "./components/StatusBadge";
import { AppShell, CardShell, PageScaffold, PanelShell, TableShell, type NavGroup } from "./components/layout";
import { CommandPalette, InstrumentDrawer } from "./components/overlays";
import { StatePanel } from "./components/states";
import { SetupFinder } from "./SetupFinder";

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
      { id: "setup-finder", label: "Setup Finder", stage: "S05.1", icon: "search", available: true },
      { id: "research", label: "Research", stage: "S06", icon: "layers" },
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
  { name: "Setup Finder", stage: "S05.1", purpose: "Review normalized TradingView opportunities", icon: "search" as const },
  { name: "Research", stage: "S06", purpose: "Ideas, evidence, and decision briefs", icon: "layers" as const },
  { name: "Trading", stage: "S07–S10", purpose: "Orders and execution workflows", icon: "chart" as const },
];

function Lobby({
  health,
  failed,
  onOpenPalette,
  onOpenDrawer,
  onOpenSetupFinder,
}: {
  health: Health | null;
  failed: boolean;
  onOpenPalette: () => void;
  onOpenDrawer: () => void;
  onOpenSetupFinder: () => void;
}) {
  const healthTone = failed ? "error" : health ? "success" : "normal";
  const healthLabel = failed ? "SYSTEM CHECK FAILED" : health ? `${health.environment.toUpperCase()} ONLINE` : "CONNECTING";

  return (
    <PageScaffold
      eyebrow="HQ / LOBBY"
      title="Good morning."
      description="A permanent operating frame for the decisions, controls, and systems that come online as the company grows."
      status={<StatusBadge tone={healthTone} label={healthLabel} />}
      actions={
        <div className="header-actions">
          <button className="button button--quiet" type="button" onClick={onOpenPalette}><Icon name="search" /><span>Commands</span><kbd>⌘ K</kbd></button>
          <button className="icon-button" type="button" onClick={onOpenDrawer} aria-label="Open instrument drawer"><Icon name="panel-right" /></button>
        </div>
      }
    >
      <section className="lobby-summary" aria-label="Headquarters summary">
        <CardShell eyebrow="OPERATING POSTURE" title="Opportunity capture is live" detail="S05.1">
          <p className="card-copy">TradingView signals now enter the durable opportunity pipeline with normalized internal instrument identity. Setup Finder is the first operational review surface.</p>
          <div className="signal-line">
            <StatusBadge tone="success" label="FOUNDATION VERIFIED" />
            <button className="text-button" type="button" onClick={onOpenSetupFinder}>Open Setup Finder</button>
          </div>
        </CardShell>

        <CardShell eyebrow="RELEASE TRACK" title="Trading workspace" detail="S05 / 1 of 3">
          <div className="progress-track" aria-label="Trading workspace: one of three sub-stages active">
            <span className="progress-fill" style={{ width: "33.333%" }} />
          </div>
          <div className="milestone-row">
            <span><Icon name="check" size="sm" /> S04 opportunity capture</span>
            <span><Icon name="circle" size="sm" /> S05.1 Setup Finder</span>
            <span className="milestone-muted"><Icon name="circle" size="sm" /> S05.2–S05.3</span>
          </div>
        </CardShell>
      </section>

      <PanelShell eyebrow="PERMANENT INSERTION POINTS" title="Module runway" detail="S03–S10" className="module-panel">
        <div className="module-grid">
          {moduleRunway.map((module) => (
            <article className="module-card" key={module.name}>
              <span className="module-icon"><Icon name={module.icon} /></span>
              <div>
                <p className="module-stage">{module.stage}</p>
                <h3>{module.name}</h3>
                <p>{module.purpose}</p>
              </div>
              <span className="reserved-label">{module.name === "Setup Finder" ? "ACTIVE" : "RESERVED"}</span>
            </article>
          ))}
        </div>
      </PanelShell>

      <TableShell eyebrow="SHARED TABLE SCAFFOLD" title="Build sequence" detail="CURRENT ROADMAP" label="Future module insertion sequence">
        <div className="shell-table-row shell-table-row--header" role="row">
          <span role="columnheader">AREA</span><span role="columnheader">STAGE</span><span role="columnheader">INSERTION POINT</span><span role="columnheader">STATE</span>
        </div>
        <div className="shell-table-row" role="row">
          <strong role="cell">Data foundation</strong><span role="cell">S02–S04</span><span role="cell">Event + opportunity core</span><span role="cell"><StatusBadge tone="success" label="VERIFIED" /></span>
        </div>
        <div className="shell-table-row" role="row">
          <strong role="cell">Decision workflow</strong><span role="cell">S05</span><span role="cell">Setup Finder</span><span role="cell"><StatusBadge tone="active" label="ACTIVE" /></span>
        </div>
        <div className="shell-table-row" role="row">
          <strong role="cell">Trading system</strong><span role="cell">S06–S18</span><span role="cell">Research + Trading + Controls</span><span role="cell"><StatusBadge tone="normal" label="PLANNED" /></span>
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
  );
}

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

  return (
    <AppShell activeItem={activeItem} navigation={navigation} onNavigate={setActiveItem}>
      {activeItem === "setup-finder" ? (
        <SetupFinder />
      ) : (
        <Lobby
          health={health}
          failed={failed}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenDrawer={() => setDrawerOpen(true)}
          onOpenSetupFinder={() => setActiveItem("setup-finder")}
        />
      )}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onOpenDrawer={() => setDrawerOpen(true)} />
      <InstrumentDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </AppShell>
  );
}

export default App;
