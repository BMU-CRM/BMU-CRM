'use client';

import { LogOut, Menu, UserRound } from 'lucide-react';
import Link from 'next/link';
import { NotificationBell, type BellNotification } from '@/components/notifications/NotificationBell';
import { PresenceDot } from '@/components/presence/PresenceDot';
import { StatusMenu } from '@/components/presence/StatusMenu';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import { signOutAction } from '@/server/actions/authActions';
import { AppBreadcrumbs } from './AppBreadcrumbs';
import { RoleSwitcher, type RoleChoice } from './RoleSwitcher';
import { ThemeToggle } from './ThemeToggle';
import styles from './AppTopbar.module.css';

export type TopbarUser = {
  employeeId: string;
  fullName: string;
  workEmail: string;
  roleName: string;
  // Every role this person can switch between. One role means no switch is shown.
  roles: RoleChoice[];
};

export type TopbarNotifications = {
  unreadCount: number;
  recent: BellNotification[];
};

type AppTopbarProps = {
  user: TopbarUser;
  notifications: TopbarNotifications;
  onOpenMobileMenu: () => void;
};

export function AppTopbar({ user, notifications, onOpenMobileMenu }: AppTopbarProps) {
  return (
    <header className={styles.topbar}>
      <button type="button" className={styles.iconButton} data-mobile-only onClick={onOpenMobileMenu} aria-label="Open menu">
        <Menu size={18} aria-hidden="true" />
      </button>

      <AppBreadcrumbs />

      <div className={styles.tools}>
        <NotificationBell
          employeeId={user.employeeId}
          unreadCount={notifications.unreadCount}
          recent={notifications.recent}
          className={styles.iconButton}
        />
        <ThemeToggle className={styles.iconButton} />

        <button type="button" className={styles.userButton} popoverTarget="user-menu" aria-label="Open user menu and status">
          <PersonAvatar name={user.fullName} size="small" />
          <PresenceDot employeeId={user.employeeId} variant="overlay" />
        </button>

        <div id="user-menu" popover="auto" className={styles.userMenu}>
          <div className={styles.userSummary}>
            <p className={styles.userName}>{user.fullName}</p>
            <p className={styles.userDetail}>{user.workEmail}</p>
            <p className={styles.userDetail}>{user.roleName}</p>
          </div>
          <StatusMenu employeeId={user.employeeId} />
          <RoleSwitcher roles={user.roles} />
          <Link href="/profile" className={styles.menuItem}>
            <UserRound size={16} aria-hidden="true" />
            My profile
          </Link>
          <form action={signOutAction}>
            <button type="submit" className={styles.menuItem}>
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
