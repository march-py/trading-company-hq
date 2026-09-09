import type { ReactNode } from "react";

export type IconName =
  | "activity"
  | "arrow-down"
  | "arrow-up"
  | "briefcase"
  | "chart"
  | "check"
  | "circle"
  | "database"
  | "help"
  | "home"
  | "layers"
  | "pause"
  | "settings"
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
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" /><path d="M3 12h18" /></>,
  chart: <><path d="M4 19V9" /><path d="M10 19V5" /><path d="M16 19v-7" /><path d="M22 19V3" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  circle: <circle cx="12" cy="12" r="7" />,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.4 2.4 0 1 1 3.2 2.3c-.8.35-.9.9-.9 1.7" /><path d="M12 17h.01" /></>,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 16 9 5 9-5" /></>,
  pause: <><path d="M9 6v12" /><path d="M15 6v12" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.37.36.7.66.96.3.26.68.4 1.08.4H21v4h-.1A1.7 1.7 0 0 0 19.4 15Z" /></>,
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
