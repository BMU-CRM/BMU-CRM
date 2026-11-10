import { StatTiles } from '@/components/ui/StatTiles';
import type { CurrentAccess } from '@/server/services/accessService';
import { getTaskStats } from '@/server/services/taskService';

export async function TaskStatsWidget({ access }: { access: CurrentAccess }) {
  const stats = await getTaskStats(access);

  return (
    <StatTiles
      tiles={[
        { label: 'Open tasks', value: stats.open, href: '/tasks?view=all' },
        { label: 'Overdue tasks', value: stats.overdue, href: '/tasks?view=all&overdue=1' },
        { label: 'Waiting for your review', value: stats.toReview, href: '/tasks?view=review' },
        { label: 'Completion rate', value: stats.completionRate === null ? '—' : `${stats.completionRate}%` },
      ]}
    />
  );
}
