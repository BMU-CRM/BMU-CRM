'use client';

import { useState, type ReactNode } from 'react';
import { PresenceHeartbeat } from '@/components/presence/PresenceHeartbeat';
import { ListInteractions } from '@/components/ui/ListInteractions';
import type { PermissionMap } from '@/lib/access/permissionKeys';
import { AppSidebar } from './AppSidebar';
import { AppTopbar, type TopbarNotifications, type TopbarUser } from './AppTopbar';
import styles from './AppShell.module.css';

type AppShellProps = {
  user: TopbarUser;
  notifications: TopbarNotifications;
  permissions: PermissionMap;
  initiallyCollapsed: boolean;
  children: ReactNode;
};

export function AppShell({ user, notifications, permissions, initiallyCollapsed, children }: AppShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(initiallyCollapsed);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  function toggleCollapsed() {
    const next = !isCollapsed;
    setIsCollapsed(next);
    document.cookie = `sidebar=${next ? 'collapsed' : 'open'}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <div className={styles.shell} data-collapsed={isCollapsed}>
      <PresenceHeartbeat />
      <ListInteractions />
      <AppSidebar
        permissions={permissions}
        isCollapsed={isCollapsed}
        isMobileOpen={isMobileOpen}
        onToggleCollapsed={toggleCollapsed}
        onCloseMobile={() => setIsMobileOpen(false)}
      />
      <div className={styles.main}>
        <AppTopbar user={user} notifications={notifications} onOpenMobileMenu={() => setIsMobileOpen(true)} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
