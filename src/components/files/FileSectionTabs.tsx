import Link from 'next/link';
import styles from '@/components/tasks/TaskViewTabs.module.css';
import type { FileSection } from '@/server/services/fileService';

const sections: { section: FileSection; label: string }[] = [
  { section: 'mine', label: 'My files' },
  { section: 'received', label: 'Received' },
  { section: 'sent', label: 'Sent' },
  { section: 'department', label: 'Department' },
  { section: 'client', label: 'Client files' },
  { section: 'project', label: 'Project files' },
  { section: 'links', label: 'Drive links' },
  { section: 'archived', label: 'Archived' },
];

export function FileSectionTabs({ current }: { current: FileSection }) {
  return (
    <nav className={styles.tabs} aria-label="File sections">
      {sections.map((tab) => (
        <Link
          key={tab.section}
          href={`/files?section=${tab.section}`}
          className={styles.tab}
          aria-current={tab.section === current ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
