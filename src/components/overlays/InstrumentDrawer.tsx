import { Icon } from "../Icon";
import { StatePanel } from "../states";

type InstrumentDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function InstrumentDrawer({ open, onClose }: InstrumentDrawerProps) {
  if (!open) return null;

  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="instrument-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="overlay-heading">
          <div>
            <p className="micro-label">GLOBAL CONTEXT</p>
            <h2 id="drawer-title">Instrument drawer</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close instrument drawer"><Icon name="x" /></button>
        </header>
        <p className="drawer-intro">This permanent surface will carry the selected instrument across future research, trading, and portfolio modules.</p>
        <StatePanel kind="empty" title="No instrument selected" message="Instrument selection arrives with the data foundation. No market data is loaded in S01.3." />
        <dl className="drawer-contract">
          <div><dt>Availability</dt><dd>Global</dd></div>
          <div><dt>Data source</dt><dd>Not connected</dd></div>
          <div><dt>Owned by</dt><dd>Future module stages</dd></div>
        </dl>
      </aside>
    </div>
  );
}
