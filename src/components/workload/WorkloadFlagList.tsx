import { AppLink as Link } from '@/components/ui/AppLink';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { formatDateTime } from '@/lib/formatDate';
import { flagHref, workloadFlagLabels, type WorkloadFlag } from '@/lib/workload/workloadFlags';
import { WorkloadFlagNoteForm } from './WorkloadFlagForms';

// Each flag: what, who, the task, and whether someone looked into it. Those who send
// reports can mark it looked into here.
export function WorkloadFlagList({ flags, canComment }: { flags: WorkloadFlag[]; canComment: boolean }) {
  return (
    <ul className={layout.list}>
      {flags.map((flag) => (
        <li key={flag.flag_key} className={layout.row}>
          <div className={layout.rowMain}>
            <div className={layout.badges}>
              <StatusBadge tone={flag.note ? 'good' : flag.kind === 'overdue' || flag.kind === 'rework' ? 'critical' : 'warning'}>
                {workloadFlagLabels[flag.kind]}
              </StatusBadge>
              {flag.note && <StatusBadge tone="good">Looked into</StatusBadge>}
            </div>
            <Link href={flagHref(flag)} className={`${layout.rowTitle} ${layout.link}`}>
              {flag.task_title ?? flag.employee_name ?? 'Someone'}
            </Link>
            <p className={layout.muted}>
              {flag.task_title && flag.employee_name ? `${flag.kind === 'review' ? 'Reviewer' : 'Assigned to'} ${flag.employee_name} · ` : ''}
              {flag.detail}
            </p>
            {flag.note && (
              <p className={layout.text}>
                “{flag.note}” — {flag.noted_by_name}
                {flag.noted_at ? `, ${formatDateTime(flag.noted_at)}` : ''}
              </p>
            )}
            {canComment && (
              <div className={layout.spaced}>
                <WorkloadFlagNoteForm flagKey={flag.flag_key} note={flag.note} />
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
