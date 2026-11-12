import { describe, expect, it } from 'vitest';
import { describeTaskChanges } from '@/lib/audit/describeAuditEntry';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { getProjectHealth, progressPercentage } from '@/lib/projects/projectHealth';
import { safeExternalUrl } from '@/lib/safeExternalUrl';
import { calculateWorkload, summariseByDepartment, type WorkloadRow } from '@/lib/tasks/calculateWorkload';
import { getTaskActions, isTaskOverdue, isTaskStage, stageOf, type TaskActor } from '@/lib/tasks/taskWorkflow';
import { clientSchema } from '@/lib/validation/clientSchema';
import { taskSchema } from '@/lib/validation/workSchema';

const today = '2026-11-06';

function row(values: Partial<WorkloadRow>): WorkloadRow {
  return {
    employee_id: 'a',
    full_name: 'Person A',
    department_name: 'Design',
    designation_title: null,
    task_id: 't',
    status: 'in_progress',
    priority: 'medium',
    complexity: 3,
    estimated_hours: 10,
    actual_hours: 0,
    completion_percentage: 0,
    quality_rating: null,
    due_date: null,
    completed_at: null,
    ...values,
  };
}

const assignee: TaskActor = { isAssignee: true, isSelfTask: false, hasReviewer: false, canManage: false, canReview: false };
const reviewer: TaskActor = { isAssignee: false, isSelfTask: false, hasReviewer: false, canManage: true, canReview: true };

function labels(status: Parameters<typeof getTaskActions>[0], actor: TaskActor) {
  return getTaskActions(status, actor).map((action) => action.label);
}

describe('isTaskOverdue', () => {
  it('flags an open task past its due date', () => {
    expect(isTaskOverdue({ status: 'in_progress', due_date: '2026-11-05' }, today)).toBe(true);
  });

  it('does not flag a task due today', () => {
    expect(isTaskOverdue({ status: 'in_progress', due_date: today }, today)).toBe(false);
  });

  it('does not flag a finished task', () => {
    expect(isTaskOverdue({ status: 'completed', due_date: '2026-01-01' }, today)).toBe(false);
  });
});

describe('getTaskActions', () => {
  it('asks the assignee to accept or reject new work', () => {
    expect(labels('assigned', assignee)).toEqual(['Accept', 'Reject']);
  });

  it('sends finished work for review', () => {
    expect(labels('in_progress', assignee)).toEqual(['Submit for review', 'Put on hold']);
  });

  it('lets people finish their own self-set task directly', () => {
    expect(labels('in_progress', { ...assignee, isSelfTask: true })).toContain('Mark complete');
  });

  it('still requires review on a self-set task with a named reviewer', () => {
    expect(labels('in_progress', { ...assignee, isSelfTask: true, hasReviewer: true })).toContain('Submit for review');
  });

  it('offers the assignee no way to approve', () => {
    expect(labels('under_review', assignee)).toEqual([]);
  });

  it('asks a reviewer to rate approvals and explain changes', () => {
    const actions = getTaskActions('under_review', reviewer);

    expect(actions.find((action) => action.label === 'Approve')?.needsRating).toBe(true);
    expect(actions.find((action) => action.label === 'Request changes')?.needsNote).toBe(true);
  });

  it('lets a manager reopen finished work, back to the assignee as changes requested', () => {
    expect(labels('completed', reviewer)).toEqual(['Reopen']);
    expect(getTaskActions('completed', reviewer)[0]?.status).toBe('changes_requested');
  });

  it('lets a manager ask to resume work on hold, while the assignee resumes it', () => {
    const ask = getTaskActions('on_hold', reviewer).find((action) => action.label === 'Ask to resume');
    expect(ask?.requestsResume).toBe(true);
    expect(labels('on_hold', reviewer)).not.toContain('Resume work');
    expect(labels('on_hold', assignee)).toContain('Resume work');
  });
});

describe('calculateWorkload', () => {
  it('counts only the work still to do', () => {
    const [person] = calculateWorkload([row({ completion_percentage: 50 })], today);

    expect(person?.remainingHours).toBe(5);
  });

  it('counts a task with no estimate', () => {
    const [person] = calculateWorkload([row({ estimated_hours: null })], today);

    expect(person?.remainingHours).toBe(4);
  });

  it('weights urgent and overdue work more heavily', () => {
    const [normal] = calculateWorkload([row({ estimated_hours: 40 })], today);
    const [urgent] = calculateWorkload([row({ estimated_hours: 40, priority: 'urgent' })], today);
    const [late] = calculateWorkload([row({ estimated_hours: 40, due_date: '2026-11-01' })], today);

    expect(normal?.utilisation).toBe(1);
    expect(urgent?.utilisation).toBe(1.5);
    expect(late?.utilisation).toBe(1.25);
    expect(late?.overdueTasks).toBe(1);
  });

  it('labels overloaded, balanced and free people', () => {
    expect(calculateWorkload([row({ estimated_hours: 60 })], today)[0]?.indicator).toBe('overloaded');
    expect(calculateWorkload([row({ estimated_hours: 30 })], today)[0]?.indicator).toBe('balanced');
    expect(calculateWorkload([row({ estimated_hours: 5 })], today)[0]?.indicator).toBe('underutilised');
  });

  it('shows someone with no tasks as having capacity', () => {
    const [person] = calculateWorkload([row({ task_id: null, status: null })], today);

    expect(person?.activeTasks).toBe(0);
    expect(person?.indicator).toBe('underutilised');
  });

  it('does not count finished work as load', () => {
    const [person] = calculateWorkload([row({ status: 'completed', completed_at: '2026-11-01T10:00:00Z' })], today);

    expect(person?.remainingHours).toBe(0);
    expect(person?.completedTasks).toBe(1);
  });

  it('measures quality, timeliness and complexity, not just task counts', () => {
    const [person] = calculateWorkload(
      [
        row({ task_id: '1', status: 'completed', complexity: 5, quality_rating: 5, due_date: '2026-11-02', completed_at: '2026-11-01T10:00:00Z', actual_hours: 10 }),
        row({ task_id: '2', status: 'completed', complexity: 1, quality_rating: 3, due_date: '2026-10-01', completed_at: '2026-11-01T10:00:00Z', actual_hours: 10 }),
      ],
      today,
    );

    expect(person?.onTimeRate).toBe(0.5);
    expect(person?.averageQuality).toBe(4);
    expect(person?.complexityPoints).toBe(6);
    expect(person?.hoursAccuracy).toBe(1);
  });

  it('shows the busiest people first', () => {
    const people = calculateWorkload(
      [row({ employee_id: 'light', estimated_hours: 2 }), row({ employee_id: 'busy', estimated_hours: 50 })],
      today,
    );

    expect(people.map((person) => person.employeeId)).toEqual(['busy', 'light']);
  });

  it('averages load across a department', () => {
    const people = calculateWorkload(
      [row({ employee_id: 'a', estimated_hours: 40 }), row({ employee_id: 'b', task_id: null, status: null })],
      today,
    );

    expect(summariseByDepartment(people)[0]).toMatchObject({ department: 'Design', people: 2, utilisation: 0.5 });
  });
});

describe('task progress stages', () => {
  it('groups every status except rejected into yet to start, doing, review or done', () => {
    expect(stageOf('assigned')).toBe('todo');
    expect(stageOf('accepted')).toBe('todo');
    expect(stageOf('in_progress')).toBe('doing');
    expect(stageOf('changes_requested')).toBe('doing');
    expect(stageOf('on_hold')).toBe('doing');
    expect(stageOf('under_review')).toBe('review');
    expect(stageOf('completed')).toBe('done');
    expect(stageOf('rejected')).toBeNull();
    expect(isTaskStage('doing')).toBe(true);
    expect(isTaskStage('toString')).toBe(false);
  });

  it('counts each person\'s work by stage, and each department\'s', () => {
    const people = calculateWorkload(
      [
        row({ task_id: '1', status: 'assigned' }),
        row({ task_id: '2', status: 'in_progress' }),
        row({ task_id: '3', status: 'under_review' }),
        row({ task_id: '4', status: 'completed', completed_at: '2026-11-01T10:00:00Z' }),
        row({ task_id: '5', status: 'rejected' }),
        row({ employee_id: 'b', full_name: 'Person B', task_id: '6', status: 'accepted' }),
      ],
      today,
    );

    expect(people.find((person) => person.employeeId === 'a')?.stageCounts).toEqual({ todo: 1, doing: 1, review: 1, done: 1 });
    expect(summariseByDepartment(people)[0]?.stageCounts).toEqual({ todo: 2, doing: 1, review: 1, done: 1 });
  });

  it('offers a link field when work is submitted', () => {
    const submit = getTaskActions('in_progress', assignee).find((action) => action.status === 'under_review');
    expect(submit?.acceptsWorkLink).toBe(true);
  });
});

describe('getProjectHealth', () => {
  it('is delayed once the due date has passed', () => {
    expect(getProjectHealth({ status: 'active', dueDate: '2026-11-01', overdueTasks: 0 }, today)).toBe('delayed');
  });

  it('is at risk when tasks are overdue', () => {
    expect(getProjectHealth({ status: 'active', dueDate: null, overdueTasks: 1 }, today)).toBe('at_risk');
  });

  it('is on track otherwise', () => {
    expect(getProjectHealth({ status: 'active', dueDate: '2027-01-01', overdueTasks: 0 }, today)).toBe('on_track');
  });

  it('is closed once finished, whatever the dates say', () => {
    expect(getProjectHealth({ status: 'completed', dueDate: '2020-01-01', overdueTasks: 3 }, today)).toBe('closed');
  });

  it('handles a project with no tasks', () => {
    expect(progressPercentage(0, 0)).toBe(0);
  });
});

describe('describeTaskChanges', () => {
  it('reads like a sentence', () => {
    const lines = describeTaskChanges({ changes: { status: { from: 'in_progress', to: 'under_review' } } });

    expect(lines).toEqual(['Changed status from in progress to under review']);
  });

  it('hides automatic fields', () => {
    const lines = describeTaskChanges({ changes: { completed_at: { from: null, to: 'x' } } });

    expect(lines).toEqual([]);
  });

  it('does not print raw ids', () => {
    const lines = describeTaskChanges({ changes: { assignee_id: { from: 'id-1', to: 'id-2' } } });

    expect(lines).toEqual(['Changed assignee']);
  });
});

describe('links are safe', () => {
  it('refuses a javascript address when rendering', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('https://example.com')).toBe('https://example.com');
  });

  it('refuses a javascript address as a task link', () => {
    const parsed = taskSchema.safeParse({
      title: 'Task',
      description: '',
      assigneeId: '',
      reviewerId: '',
      projectId: '',
      clientId: '',
      priority: 'medium',
      complexity: '3',
      startDate: '',
      dueDate: '',
      estimatedHours: '',
      recurrence: 'none',
      referenceLinks: 'javascript:alert(1)',
    });

    expect(parsed.success).toBe(false);
  });

  it('adds https to a bare website', () => {
    const parsed = clientSchema.parse({
      companyName: 'Acme',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      industry: '',
      website: 'acme.com',
      status: 'lead',
      onboardingDate: '',
      nextFollowUpDate: '',
      importantNotes: '',
      clientManagerId: '',
      departmentId: '',
      gstin: '',
      billingState: '',
      industryId: '',
      serviceGroupIds: ['7d2e1c4b-3a5f-4e6d-9c8b-1a2b3c4d5e6f'],
      serviceIds: ['3f1c7a6e-9b1d-4c2a-8e5f-2a7b9c0d1e2f'],
    });

    expect(parsed.website).toBe('https://acme.com');
  });
});

describe('cleanSearchTerm', () => {
  it('removes filter syntax but keeps emails and names', () => {
    expect(cleanSearchTerm('a,b)(c')).toBe('a b  c');
    expect(cleanSearchTerm('ravi@test.local')).toBe('ravi@test.local');
    expect(cleanSearchTerm("o'brien")).toBe("o'brien");
  });
});
