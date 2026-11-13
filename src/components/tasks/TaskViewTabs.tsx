import { AppLink as Link } from '@/components/ui/AppLink';
import type { TaskView } from '@/server/services/taskService';
import styles from './TaskViewTabs.module.css';

const tabs: { view: TaskView; label: string }[] = [
  { view: 'mine', label: 'My tasks' },
  { view: 'assigned', label: 'Assigned by me' },
  { view: 'review', label: 'To review' },
  { view: 'all', label: 'All tasks' },
];

export function TaskViewTabs({ current, reviewCount }: { current: TaskView; reviewCount: number }) {
  return (
    <nav className={styles.tabs} aria-label="Task views">
      {tabs.map((tab) => (
        <Link
          key={tab.view}
          href={`/tasks?view=${tab.view}`}
          className={styles.tab}
          aria-current={tab.view === current ? 'page' : undefined}
        >
          {tab.label}
          {tab.view === 'review' && reviewCount > 0 && <span className={styles.count}>{reviewCount}</span>}
        </Link>
      ))}
    </nav>
  );
}
