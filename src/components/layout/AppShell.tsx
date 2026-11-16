'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { PresenceHeartbeat } from '@/components/presence/PresenceHeartbeat';
import { ListInteractions } from '@/components/ui/ListInteractions';
import type { PermissionMap } from '@/lib/access/permissionKeys';
import type { LiveConfig } from '@/lib/live/liveConfig';
import { seedLiveConfig } from '@/lib/live/liveUpdates';
import { AppSidebar } from './AppSidebar';
import { AppTopbar, type TopbarNotifications, type TopbarUser } from './AppTopbar';
import styles from './AppShell.module.css';

type AppShellProps = {
  user: TopbarUser;
  notifications: TopbarNotifications;
  permissions: PermissionMap;
  initiallyCollapsed: boolean;
  // How the page receives live updates; null asks /api/live/config instead.
  liveConfig: LiveConfig | null;
  children: ReactNode;
};

export function AppShell({ user, notifications, permissions, initiallyCollapsed, liveConfig, children }: AppShellProps) {
  // Before any live connection opens, which waits a moment after the page starts.
  useEffect(() => seedLiveConfig(liveConfig), [liveConfig]);
  const [isCollapsed, setIsCollapsed] = useState(initiallyCollapsed);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  function toggleCollapsed() {
    const next = !isCollapsed;
    setIsCollapsed(next);
    document.cookie = `sidebar=${next ? 'collapsed' : 'open'}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <div className={styles.shell} data-collapsed={isCollapsed}>
      <PresenceHeartbeat employeeId={user.employeeId} />
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
