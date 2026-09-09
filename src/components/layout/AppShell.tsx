import type { ReactNode } from "react";
import { Sidebar, type NavGroup } from "./Sidebar";

type AppShellProps = {
  activeItem: string;
  navigation: NavGroup[];
  onNavigate: (id: string) => void;
  children: ReactNode;
};

export function AppShell({ activeItem, navigation, onNavigate, children }: AppShellProps) {
  return (
    <div className="app-frame">
      <Sidebar activeItem={activeItem} groups={navigation} onNavigate={onNavigate} />
      <main className="content-region">{children}</main>
    </div>
  );
}
