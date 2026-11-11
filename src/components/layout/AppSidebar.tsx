'use client';

import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buildNavigation } from '@/lib/access/navigationRegistry';
import type { PermissionMap } from '@/lib/access/permissionKeys';
import styles from './AppSidebar.module.css';
import { BrandLogo } from './BrandLogo';

type AppSidebarProps = {
  permissions: PermissionMap;
  isCollapsed: boolean;
  isMobileOpen: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
};

export function AppSidebar({
  permissions,
  isCollapsed,
  isMobileOpen,
  onToggleCollapsed,
  onCloseMobile,
}: AppSidebarProps) {
  const pathname = usePathname();
  const sections = buildNavigation(permissions);
  const CollapseIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <>
      {isMobileOpen && <div className={styles.backdrop} onClick={onCloseMobile} aria-hidden="true" />}
      <aside className={styles.sidebar} data-collapsed={isCollapsed} data-mobile-open={isMobileOpen}>
        <div className={styles.brand}>
          <Link href="/overview" className={styles.brandLink} onClick={onCloseMobile} title="BMU Workspace: go to Overview">
            <BrandLogo variant="full" className={styles.brandLogo} />
            <BrandLogo className={styles.brandMark} />
            <span className={styles.brandDivider} aria-hidden="true" />
            <span className={styles.brandName}>Workspace</span>
          </Link>
          <button type="button" className={styles.mobileClose} onClick={onCloseMobile} aria-label="Close menu">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav className={styles.navigation} aria-label="Main">
          {sections.map((section) => (
            <div key={section.title} className={styles.section}>
              <p className={styles.sectionTitle}>{section.title}</p>
              <ul>
                {section.items.map((item) => {
                  const isCurrent = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={styles.link}
                        aria-current={isCurrent ? 'page' : undefined}
                        title={isCollapsed ? item.label : undefined}
                        onClick={onCloseMobile}
                      >
                        <Icon size={18} aria-hidden="true" />
                        <span className={styles.linkLabel}>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <button
          type="button"
          className={styles.collapse}
          onClick={onToggleCollapsed}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <CollapseIcon size={18} aria-hidden="true" />
        </button>
      </aside>
    </>
  );
}
