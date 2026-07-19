import { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

interface SocialLayoutProps {
  children: ReactNode;
  rightSidebar?: ReactNode;
  onPostClick?: () => void;
}

export function SocialLayout({ children, rightSidebar, onPostClick }: SocialLayoutProps) {
  return (
    <AppShell onPostClick={onPostClick} rightSidebar={rightSidebar}>
      {children}
    </AppShell>
  );
}
