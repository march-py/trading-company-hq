import type { ReactNode } from "react";

type PageScaffoldProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
};

export function PageScaffold({ eyebrow, title, description, actions, status, children }: PageScaffoldProps) {
  return (
    <div className="page-scaffold">
      <header className="page-header">
        <div className="page-heading">
          <p className="micro-label">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="page-controls">
          {status}
          {actions}
        </div>
      </header>
      <div className="page-content">{children}</div>
    </div>
  );
}
