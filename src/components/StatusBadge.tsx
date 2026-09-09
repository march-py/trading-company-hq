import { Icon, type IconName } from "./Icon";

export type StatusTone = "normal" | "active" | "success" | "warning" | "error" | "disabled" | "unknown";

const defaults: Record<StatusTone, { label: string; icon: IconName }> = {
  normal: { label: "NORMAL", icon: "circle" },
  active: { label: "ACTIVE", icon: "activity" },
  success: { label: "HEALTHY", icon: "check" },
  warning: { label: "ATTENTION", icon: "warning" },
  error: { label: "BLOCKED", icon: "x" },
  disabled: { label: "DISABLED", icon: "pause" },
  unknown: { label: "UNKNOWN", icon: "help" },
};

type StatusBadgeProps = {
  tone: StatusTone;
  label?: string;
};

export function StatusBadge({ tone, label }: StatusBadgeProps) {
  const status = defaults[tone];

  return (
    <span className={`status-badge status-badge--${tone}`}>
      <Icon name={status.icon} size="sm" />
      <span>{label ?? status.label}</span>
    </span>
  );
}
