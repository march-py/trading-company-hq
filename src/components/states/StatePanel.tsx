import type { ReactNode } from "react";
import { Icon, type IconName } from "../Icon";

export type StateKind = "loading" | "error" | "empty";

const stateIcons: Record<StateKind, IconName> = {
  loading: "refresh",
  error: "warning",
  empty: "inbox",
};

type StatePanelProps = {
  kind: StateKind;
  title: string;
  message: string;
  action?: ReactNode;
};

export function StatePanel({ kind, title, message, action }: StatePanelProps) {
  return (
    <section className={`state-panel state-panel--${kind}`} aria-live={kind === "loading" ? "polite" : undefined}>
      <span className="state-panel-icon" aria-hidden="true"><Icon name={stateIcons[kind]} /></span>
      <div>
        <p className="state-panel-kind">{kind.toUpperCase()}</p>
        <h3>{title}</h3>
        <p>{message}</p>
      </div>
      {action && <div className="state-panel-action">{action}</div>}
    </section>
  );
}
