import { Icon, type IconName } from "../Icon";

export type NavItem = {
  id: string;
  label: string;
  stage: string;
  icon: IconName;
  available?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

type SidebarProps = {
  activeItem: string;
  groups: NavGroup[];
  onNavigate: (id: string) => void;
};

export function Sidebar({ activeItem, groups, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="HQ navigation">
      <div className="sidebar-brand">
        <span className="brand-mark" aria-hidden="true">TC</span>
        <div>
          <p className="micro-label">TRADING COMPANY</p>
          <strong>Headquarters</strong>
        </div>
      </div>

      <nav className="sidebar-nav">
        {groups.map((group) => (
          <section className="nav-group" key={group.label} aria-labelledby={`nav-${group.label.toLowerCase().replaceAll(" ", "-")}`}>
            <h2 id={`nav-${group.label.toLowerCase().replaceAll(" ", "-")}`}>{group.label}</h2>
            <div className="nav-list">
              {group.items.map((item) => {
                const active = item.id === activeItem;
                const available = item.available ?? false;

                return (
                  <button
                    className={`nav-item${active ? " nav-item--active" : ""}`}
                    type="button"
                    key={item.id}
                    aria-current={active ? "page" : undefined}
                    disabled={!available}
                    onClick={() => onNavigate(item.id)}
                  >
                    <Icon name={item.icon} />
                    <span className="nav-item-copy">
                      <strong>{item.label}</strong>
                      <small>{available ? item.stage : `${item.stage} · PLANNED`}</small>
                    </span>
                    {active && <span className="nav-active-mark" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="sidebar-footer">
        <Icon name="shield" size="sm" />
        <span>PRIVATE OPERATING ENVIRONMENT</span>
      </div>
    </aside>
  );
}
