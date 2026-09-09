import type { ReactNode } from "react";

type SurfaceProps = {
  title: string;
  eyebrow?: string;
  detail?: string;
  className?: string;
  children: ReactNode;
};

function SurfaceHeading({ title, eyebrow, detail }: Omit<SurfaceProps, "children" | "className">) {
  return (
    <header className="surface-heading">
      <div>
        {eyebrow && <p className="micro-label">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {detail && <span>{detail}</span>}
    </header>
  );
}

export function PanelShell({ title, eyebrow, detail, className = "", children }: SurfaceProps) {
  return (
    <section className={`panel-shell ${className}`.trim()}>
      <SurfaceHeading title={title} eyebrow={eyebrow} detail={detail} />
      {children}
    </section>
  );
}

export function CardShell({ title, eyebrow, detail, className = "", children }: SurfaceProps) {
  return (
    <article className={`card-shell ${className}`.trim()}>
      <SurfaceHeading title={title} eyebrow={eyebrow} detail={detail} />
      {children}
    </article>
  );
}

type TableShellProps = SurfaceProps & {
  label: string;
};

export function TableShell({ title, eyebrow, detail, label, className = "", children }: TableShellProps) {
  return (
    <section className={`table-shell ${className}`.trim()}>
      <SurfaceHeading title={title} eyebrow={eyebrow} detail={detail} />
      <div className="table-frame" role="table" aria-label={label}>{children}</div>
    </section>
  );
}
