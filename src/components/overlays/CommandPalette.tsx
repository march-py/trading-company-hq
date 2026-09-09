import { useEffect, useState } from "react";
import { Icon } from "../Icon";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onOpenDrawer: () => void;
};

const plannedCommands = ["Open Market data", "Open Research", "Open Trading", "Open Portfolio"];

export function CommandPalette({ open, onClose, onOpenDrawer }: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (!open) return null;

  const normalized = query.trim().toLowerCase();
  const commands = plannedCommands.filter((command) => command.toLowerCase().includes(normalized));

  return (
    <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-title">
        <header className="overlay-heading">
          <div>
            <p className="micro-label">GLOBAL ACTIONS</p>
            <h2 id="command-title">Command palette</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close command palette"><Icon name="x" /></button>
        </header>
        <label className="command-search">
          <Icon name="search" />
          <span className="sr-only">Search commands</span>
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actions and modules" />
          <kbd>ESC</kbd>
        </label>
        <div className="command-list">
          <button type="button" onClick={onClose}><Icon name="home" /><span><strong>Go to Lobby</strong><small>AVAILABLE</small></span></button>
          <button type="button" onClick={() => { onOpenDrawer(); onClose(); }}><Icon name="panel-right" /><span><strong>Open instrument drawer</strong><small>FOUNDATION</small></span></button>
          {commands.map((command) => <button type="button" disabled key={command}><Icon name="circle" /><span><strong>{command}</strong><small>PLANNED</small></span></button>)}
          {commands.length === 0 && <p className="command-no-results">No matching foundation commands.</p>}
        </div>
      </section>
    </div>
  );
}
