import { AppLink as Link } from '@/components/ui/AppLink';
import styles from './PageTabs.module.css';

export type PageTab = { href: string; label: string; current: boolean };

// A row of links that switch between views of one page.
export function PageTabs({ tabs, label }: { tabs: PageTab[]; label: string }) {
  return (
    <nav className={styles.tabs} aria-label={label}>
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className={styles.tab} aria-current={tab.current ? 'page' : undefined} scroll={false}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
