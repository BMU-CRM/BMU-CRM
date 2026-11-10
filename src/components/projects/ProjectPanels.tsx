import Link from 'next/link';
import { ActionButton } from '@/components/ui/ActionButton';
import { SelectField, TextField, type SelectOption } from '@/components/ui/FormFields';
import { InlineActionForm } from '@/components/ui/InlineActionForm';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import {
  addMilestoneAction,
  addProjectMemberAction,
  deleteMilestoneAction,
  removeProjectMemberAction,
  setMilestoneDoneAction,
} from '@/server/actions/projectActions';
import type { listProjectMembers, listProjectMilestones } from '@/server/services/projectService';

type MembersProps = {
  projectId: string;
  members: Awaited<ReturnType<typeof listProjectMembers>>;
  options: SelectOption[];
  canManage: boolean;
};

export function ProjectMembersPanel({ projectId, members, options, canManage }: MembersProps) {
  const available = options.filter((option) => !members.some((member) => member.id === option.value));

  return (
    <Panel title="Team" description={`${members.length} ${members.length === 1 ? 'member' : 'members'}`} flush>
      {members.length === 0 ? (
        <p className={layout.emptyText}>No team members yet.</p>
      ) : (
        <ul className={layout.list}>
          {members.map((member) => (
            <li key={member.id} className={layout.row}>
              <div className={layout.rowMain}>
                <Link href={`/people/employees/${member.id}`} className={`${layout.rowTitle} ${layout.link}`}>
                  {member.full_name}
                </Link>
                <p className={layout.muted}>{member.designation?.title ?? 'No designation'}</p>
              </div>
              {canManage && <ActionButton label="Remove" action={removeProjectMemberAction.bind(null, projectId, member.id)} />}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className={layout.sectionForm}>
          <InlineActionForm action={addProjectMemberAction.bind(null, projectId)} submitLabel="Add">
            <SelectField label="Person" name="employeeId" options={available} placeholder="Choose someone" required />
          </InlineActionForm>
        </div>
      )}
    </Panel>
  );
}

type MilestonesProps = {
  projectId: string;
  milestones: Awaited<ReturnType<typeof listProjectMilestones>>;
  canManage: boolean;
};

export function ProjectMilestonesPanel({ projectId, milestones, canManage }: MilestonesProps) {
  const today = todayInIndia();
  const done = milestones.filter((milestone) => milestone.completed_at).length;

  return (
    <Panel title="Milestones" description={`${done} of ${milestones.length} reached`} flush>
      {milestones.length === 0 ? (
        <p className={layout.emptyText}>No milestones yet.</p>
      ) : (
        <ul className={layout.list}>
          {milestones.map((milestone) => (
            <li key={milestone.id} className={layout.row}>
              <div className={layout.rowMain}>
                <p className={layout.rowTitle}>{milestone.title}</p>
                <p className={layout.muted}>{milestone.due_date ? `Due ${formatDate(milestone.due_date)}` : 'No date'}</p>
              </div>
              <span className={layout.rowActions}>
                {milestone.completed_at && <StatusBadge tone="good">Reached</StatusBadge>}
                {!milestone.completed_at && milestone.due_date && milestone.due_date < today && (
                  <StatusBadge tone="critical">Overdue</StatusBadge>
                )}
                {canManage && (
                  <>
                    <ActionButton
                      label={milestone.completed_at ? 'Undo' : 'Done'}
                      action={setMilestoneDoneAction.bind(null, projectId, milestone.id, !milestone.completed_at)}
                    />
                    <ActionButton label="Remove" action={deleteMilestoneAction.bind(null, projectId, milestone.id)} />
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className={layout.sectionForm}>
          <InlineActionForm action={addMilestoneAction.bind(null, projectId)} submitLabel="Add">
            <TextField label="Milestone" name="title" required />
            <TextField label="Due date" name="dueDate" type="date" />
          </InlineActionForm>
        </div>
      )}
    </Panel>
  );
}
