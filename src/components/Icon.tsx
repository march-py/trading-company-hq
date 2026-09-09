import type { ReactNode } from "react";

export type IconName =
  | "activity"
  | "arrow-down"
  | "arrow-up"
  | "check"
  | "circle"
  | "help"
  | "layers"
  | "pause"
  | "shield"
  | "warning"
  | "x";

type IconProps = {
  name: IconName;
  size?: "sm" | "md" | "lg";
  label?: string;
};

const paths: Record<IconName, ReactNode> = {
  activity: <path d="M3 12h3l2.2-6 3.4 12L14 12h7" />,
  "arrow-down": <><path d="M12 5v14" /><path d="m18 13-6 6-6-6" /></>,
  "arrow-up": <><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  circle: <circle cx="12" cy="12" r="7" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.4 2.4 0 1 1 3.2 2.3c-.8.35-.9.9-.9 1.7" /><path d="M12 17h.01" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 16 9 5 9-5" /></>,
  pause: <><path d="M9 6v12" /><path d="M15 6v12" /></>,
  shield: <path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" />,
  warning: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5" /><path d="M12 18h.01" /></>,
  x: <><path d="m7 7 10 10" /><path d="M17 7 7 17" /></>,
};

export function Icon({ name, size = "md", label }: IconProps) {
  return (
    <svg
      className={`icon icon--${size}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      {paths[name]}
    </svg>
  );
}
