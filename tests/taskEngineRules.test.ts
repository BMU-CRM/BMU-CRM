// Runs as real signed-in users, because the rules must hold even if the app is bypassed.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonymousClient, createTestPeople, type Client } from './helpers/testDatabase';

const runId = Date.now();

describe('clients, projects and the task engine', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  const taskIds: string[] = [];
  const projectIds: string[] = [];
  const clientIds: string[] = [];
  let designDepartment = '';

  async function newTask(actor: Client, values: { title?: string; assignee_id?: string | null; [key: string]: unknown }) {
    const { data, error } = await actor
      .from('tasks')
      .insert({ title: 'Test task', ...values })
      .select('id, status, created_by, department_id, client_id')
      .single();
    if (data) taskIds.push(data.id);
    return { data, error };
  }

  async function taskRow(id: string) {
    const { data } = await admin.from('tasks').select('*').eq('id', id).single();
    return data!;
  }

  function setStatus(actor: Client, id: string, status: string) {
    return actor.from('tasks').update({ status: status as never }).eq('id', id);
  }

  async function moveToReview(id: string, assignee: Client) {
    for (const status of ['accepted', 'in_progress', 'under_review']) {
      const { error } = await setStatus(assignee, id, status);
      expect(error).toBeNull();
    }
  }

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('manager', 'Client Manager', 'Client Services', 'founder');
    await people.addPerson('otherManager', 'Client Manager', 'Client Services', 'founder');
    await people.addPerson('designHead', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'designHead');
    await people.addPerson('developer', 'Employee', 'Design & Development', 'designHead');
    await people.addPerson('marketingHead', 'Digital Marketing Head', 'Digital Marketing', 'founder');
    await people.addPerson('marketer', 'Employee', 'Digital Marketing', 'marketingHead');

    designDepartment = await people.departmentId('Design & Development');
    await admin.from('departments').update({ head_employee_id: ids.designHead! }).eq('id', designDepartment);
    await admin
      .from('departments')
      .update({ head_employee_id: ids.marketingHead! })
      .eq('id', await people.departmentId('Digital Marketing'));
  });

  afterAll(async () => {
    await admin.from('departments').update({ head_employee_id: null }).in('head_employee_id', Object.values(ids));
    await admin.from('tasks').delete().in('assignee_id', Object.values(ids)).not('parent_task_id', 'is', null);
    await admin.from('tasks').delete().in('created_by', Object.values(ids)).not('parent_task_id', 'is', null);
    await admin.from('tasks').delete().in('created_by', Object.values(ids));
    await admin.from('projects').delete().in('id', projectIds);
    await admin.from('clients').delete().in('id', clientIds);
    await people.removeEveryone();
  });

  describe('anonymous visitors', () => {
    it.each(['clients', 'client_records', 'client_services', 'projects', 'project_members', 'project_milestones', 'tasks', 'task_comments', 'task_checklist_items', 'task_dependencies', 'task_collaborators'] as const)(
      'cannot read %s',
      async (table) => {
        const { error } = await anonymousClient().from(table).select('*').limit(1);

        expect(error?.code).toBe('42501');
      },
    );

    it('cannot call reporting functions', async () => {
      const { error } = await anonymousClient().rpc('get_workload_rows');

      expect(error).not.toBeNull();
    });
  });

  describe('clients', () => {
    let clientId = '';

    it('lets a Client Manager add a client, and records who did it from the session', async () => {
      const { data, error } = await as.manager!
        .from('clients')
        .insert({
          company_name: `Test Client ${runId}`,
          client_manager_id: ids.manager!,
          department_id: designDepartment,
          created_by: ids.founder!,
        })
        .select('id, created_by, client_code')
        .single();

      expect(error).toBeNull();
      expect(data?.created_by).toBe(ids.manager);
      expect(data?.client_code).toMatch(/^CLI-\d{4}$/);
      clientId = data!.id;
      clientIds.push(clientId);
    });

    it('stops an employee adding a client', async () => {
      const { error } = await as.designer!.from('clients').insert({ company_name: `Intruder ${runId}` });

      expect(error?.code).toBe('42501');
    });

    it('hides clients from ordinary employees', async () => {
      const { data } = await as.designer!.from('clients').select('id').eq('id', clientId);

      expect(data).toEqual([]);
    });

    it('keeps clients away from department heads, who have no Clients section', async () => {
      const design = await as.designHead!.from('clients').select('id').eq('id', clientId);
      const marketing = await as.marketingHead!.from('clients').select('id').eq('id', clientId);

      expect(design.data).toEqual([]);
      expect(marketing.data).toEqual([]);
    });

    it('stops a Client Manager editing a client that is not theirs', async () => {
      const { data } = await as.otherManager!
        .from('clients')
        .update({ industry: 'Changed' })
        .eq('id', clientId)
        .select('id');

      expect(data ?? []).toEqual([]);
    });

    it('stops anyone deleting a client', async () => {
      const { error } = await as.founder!.from('clients').delete().eq('id', clientId);

      expect(error?.code).toBe('42501');
    });

    it('builds a timeline of what happened, without exposing field values', async () => {
      await as.manager!.from('clients').update({ status: 'active' }).eq('id', clientId);
      await as.manager!.from('client_records').insert({ client_id: clientId, kind: 'requirement', title: 'New website' });

      const { data } = await as.manager!.rpc('get_client_timeline', { p_client: clientId });
      const kinds = data?.map((entry) => entry.entity_type);

      expect(kinds).toContain('clients');
      expect(kinds).toContain('client_records');
      expect(data?.find((entry) => entry.action === 'updated')?.details).toEqual({
        label: `Test Client ${runId}`,
        changes: { status: true },
      });
    });

    it('hides the timeline from people who cannot see the client', async () => {
      const { data } = await as.designer!.rpc('get_client_timeline', { p_client: clientId });

      expect(data).toEqual([]);
    });

    it('still shows the client name to someone working for that client', async () => {
      const { data } = await as.designer!.rpc('get_client_labels', { p_clients: [clientId] });

      expect(data?.[0]?.company_name).toBe(`Test Client ${runId}`);
    });
  });

  describe('projects', () => {
    let projectId = '';

    it('lets a head create a project in their own department only', async () => {
      const own = await as.designHead!
        .from('projects')
        .insert({ name: `Test Project ${runId}`, department_id: designDepartment })
        .select('id')
        .single();
      expect(own.error).toBeNull();
      projectId = own.data!.id;
      projectIds.push(projectId);

      const other = await as.designHead!
        .from('projects')
        .insert({ name: 'Elsewhere', department_id: await people.departmentId('Finance') });
      expect(other.error?.code).toBe('42501');
    });

    it('shows a project to its members only, at own scope', async () => {
      expect((await as.designer!.from('projects').select('id').eq('id', projectId)).data).toEqual([]);

      await as.designHead!.from('project_members').insert({ project_id: projectId, employee_id: ids.designer! });

      expect((await as.designer!.from('projects').select('id').eq('id', projectId)).data).toHaveLength(1);
      expect((await as.developer!.from('projects').select('id').eq('id', projectId)).data).toEqual([]);
    });

    it('stops a member changing the project team', async () => {
      const { error } = await as.designer!
        .from('project_members')
        .insert({ project_id: projectId, employee_id: ids.developer! });

      expect(error?.code).toBe('42501');
    });

    it('reports progress only for projects you can see', async () => {
      const visible = await as.designer!.rpc('get_project_progress', { p_projects: [projectId] });
      const hidden = await as.developer!.rpc('get_project_progress', { p_projects: [projectId] });

      expect(visible.data).toHaveLength(1);
      expect(hidden.data).toEqual([]);
    });

    it('stops a task being linked to a project you cannot see', async () => {
      const { error } = await newTask(as.developer!, { project_id: projectId, assignee_id: ids.developer! });

      expect(error?.message).toContain('do not have access to this project');
    });
  });

  describe('who can assign to whom', () => {
    it('lets a head assign to their team member', async () => {
      const { error, data } = await newTask(as.designHead!, { assignee_id: ids.designer! });

      expect(error).toBeNull();
      expect(data?.status).toBe('assigned');
    });

    it('stops a head assigning to a member of another department', async () => {
      const { error } = await newTask(as.designHead!, { assignee_id: ids.marketer! });

      expect(error?.message).toContain('cannot assign work to this person');
    });

    it('lets a head assign to another department head', async () => {
      const { error } = await newTask(as.designHead!, { assignee_id: ids.marketingHead! });

      expect(error).toBeNull();
    });

    it('lets a Client Manager assign to a department head but not their team', async () => {
      const head = await newTask(as.manager!, { assignee_id: ids.designHead! });
      const member = await newTask(as.manager!, { assignee_id: ids.designer! });

      expect(head.error).toBeNull();
      expect(member.error?.message).toContain('cannot assign work');
    });

    it('lets the Founder assign to anyone', async () => {
      const { error } = await newTask(as.founder!, { assignee_id: ids.marketer! });

      expect(error).toBeNull();
    });

    it('stops an employee assigning to a colleague but lets them task themselves', async () => {
      const colleague = await newTask(as.designer!, { assignee_id: ids.developer! });
      const self = await newTask(as.designer!, { assignee_id: ids.designer! });

      expect(colleague.error?.message).toContain('cannot assign work');
      expect(self.error).toBeNull();
      expect(self.data?.status).toBe('accepted');
    });

    it('ignores a forged creator and status', async () => {
      const { data } = await newTask(as.designer!, {
        assignee_id: ids.designer!,
        created_by: ids.founder!,
        status: 'completed',
      });

      expect(data?.created_by).toBe(ids.designer);
      expect(data?.status).toBe('accepted');
    });

    it('takes the department from the assignee', async () => {
      const { data } = await newTask(as.founder!, { assignee_id: ids.designer! });

      expect(data?.department_id).toBe(designDepartment);
    });

    it('offers only the people you can really assign to', async () => {
      const { data } = await as.designHead!.rpc('get_assignable_employee_ids');

      expect(data).toEqual(expect.arrayContaining([ids.designer, ids.developer, ids.marketingHead, ids.designHead]));
      expect(data).not.toContain(ids.marketer);
    });
  });

  describe('who can see tasks', () => {
    it('shows a task to those involved and to the department head, but not colleagues', async () => {
      const { data } = await newTask(as.designHead!, { assignee_id: ids.designer! });
      const id = data!.id;

      expect((await as.designer!.from('tasks').select('id').eq('id', id)).data).toHaveLength(1);
      expect((await as.designHead!.from('tasks').select('id').eq('id', id)).data).toHaveLength(1);
      expect((await as.developer!.from('tasks').select('id').eq('id', id)).data).toEqual([]);
      expect((await as.marketingHead!.from('tasks').select('id').eq('id', id)).data).toEqual([]);
    });

    it('shows a task to a collaborator once added', async () => {
      const { data } = await newTask(as.designHead!, { assignee_id: ids.designer! });
      await as.designHead!.from('task_collaborators').insert({ task_id: data!.id, employee_id: ids.developer! });

      expect((await as.developer!.from('tasks').select('id').eq('id', data!.id)).data).toHaveLength(1);
    });
  });

  describe('workflow', () => {
    it('runs from assignment to verified completion', async () => {
      const { data } = await newTask(as.designHead!, { assignee_id: ids.designer! });
      const id = data!.id;

      await moveToReview(id, as.designer!);

      const { error } = await as.designHead!.from('tasks').update({ status: 'completed', quality_rating: 4 }).eq('id', id);
      expect(error).toBeNull();

      const task = await taskRow(id);
      expect(task.completion_percentage).toBe(100);
      expect(task.verified_by).toBe(ids.designHead);
      expect(task.completed_at).not.toBeNull();
      expect(task.quality_rating).toBe(4);
    });

    it('stops the assignee signing off their own work', async () => {
      const { data } = await newTask(as.designHead!, { assignee_id: ids.designer! });
      await moveToReview(data!.id, as.designer!);

      const { error } = await setStatus(as.designer!, data!.id, 'completed');

      expect(error?.message).toContain('cannot move this task');
    });

    it('stops a head signing off work assigned to them, even with manager access', async () => {
      const { data } = await newTask(as.founder!, { assignee_id: ids.designHead! });
      await moveToReview(data!.id, as.designHead!);

      const { error } = await setStatus(as.designHead!, data!.id, 'completed');

      expect(error?.message).toContain('cannot move this task');
    });

    it('stops a head moving the deadline on work assigned to them', async () => {
      const { data } = await newTask(as.founder!, { assignee_id: ids.designHead! });

      const { error } = await as.designHead!.from('tasks').update({ due_date: '2030-01-01' }).eq('id', data!.id);

      expect(error?.message).toContain('do not have permission to change these task details');
    });

    it('stops skipping steps', async () => {
      const { data } = await newTask(as.designHead!, { assignee_id: ids.designer! });

      const { error } = await setStatus(as.designer!, data!.id, 'under_review');

      expect(error?.message).toContain('cannot move this task');
    });

    it('sends work back and lets it return', async () => {
      const { data } = await newTask(as.designHead!, { assignee_id: ids.designer! });
      await moveToReview(data!.id, as.designer!);

      expect((await setStatus(as.designHead!, data!.id, 'changes_requested')).error).toBeNull();
      expect((await setStatus(as.designer!, data!.id, 'in_progress')).error).toBeNull();
    });

    it('lets someone finish a task they set for themselves in one step', async () => {
      const { data } = await newTask(as.designer!, { assignee_id: ids.designer! });

      await setStatus(as.designer!, data!.id, 'in_progress');
      const { error } = await setStatus(as.designer!, data!.id, 'completed');

      expect(error).toBeNull();
    });

    it('stops someone rating their own work', async () => {
      const { data } = await newTask(as.designHead!, { assignee_id: ids.designer! });

      const { error } = await as.designer!.from('tasks').update({ quality_rating: 5 }).eq('id', data!.id);

      expect(error?.message).toContain('Only the reviewer');
    });

    it('stops anyone faking the sign-off fields', async () => {
      const { data } = await newTask(as.designer!, { assignee_id: ids.designer! });

      const { error } = await as.designer!.from('tasks').update({ verified_by: ids.founder! }).eq('id', data!.id);

      expect(error?.code).toBe('42501');
    });

    it('lets the assignee update progress but not task details', async () => {
      const { data } = await newTask(as.designHead!, { assignee_id: ids.designer! });

      const progress = await as.designer!.from('tasks').update({ completion_percentage: 40, actual_hours: 3 }).eq('id', data!.id);
      const details = await as.designer!.from('tasks').update({ priority: 'urgent' }).eq('id', data!.id);

      expect(progress.error).toBeNull();
      expect(details.error?.message).toContain('do not have permission');
    });

    it('resets the workflow when reassigned', async () => {
      const { data } = await newTask(as.designHead!, { assignee_id: ids.designer! });
      await setStatus(as.designer!, data!.id, 'accepted');

      const { error } = await as.designHead!.from('tasks').update({ assignee_id: ids.developer! }).eq('id', data!.id);

      expect(error).toBeNull();
      expect((await taskRow(data!.id)).status).toBe('assigned');
    });

    it('stops an assignee reassigning their own task', async () => {
      const { data } = await newTask(as.designHead!, { assignee_id: ids.designer! });

      const { error } = await as.designer!.from('tasks').update({ assignee_id: ids.developer! }).eq('id', data!.id);

      expect(error?.code).toBe('42501');
    });

    it('records the history of a task', async () => {
      const { data } = await newTask(as.designHead!, { assignee_id: ids.designer! });
      await setStatus(as.designer!, data!.id, 'accepted');

      const { data: history } = await as.designer!.rpc('get_task_history', { p_task: data!.id });

      expect(history?.map((entry) => entry.action)).toEqual(['updated', 'created']);
      expect(history?.[0]?.details).toHaveProperty('changes.status.to', 'accepted');
    });

    it('keeps started work on record', async () => {
      const { data } = await newTask(as.designHead!, { assignee_id: ids.designer! });
      await setStatus(as.designer!, data!.id, 'accepted');

      const { data: deleted } = await as.designHead!.from('tasks').delete().eq('id', data!.id).select('id');

      expect(deleted).toEqual([]);
    });
  });

  describe('dependencies, subtasks and recurrence', () => {
    it('blocks a task until what it depends on is complete', async () => {
      const first = await newTask(as.designHead!, { assignee_id: ids.designer! });
      const second = await newTask(as.designHead!, { assignee_id: ids.designer! });
      await as.designHead!.from('task_dependencies').insert({ task_id: second.data!.id, depends_on_task_id: first.data!.id });

      await setStatus(as.designer!, second.data!.id, 'accepted');
      const blocked = await setStatus(as.designer!, second.data!.id, 'in_progress');
      expect(blocked.error?.message).toContain('waiting for another task');

      await moveToReview(first.data!.id, as.designer!);
      await setStatus(as.designHead!, first.data!.id, 'completed');

      expect((await setStatus(as.designer!, second.data!.id, 'in_progress')).error).toBeNull();
    });

    it('rejects tasks waiting for each other, at any depth', async () => {
      const a = await newTask(as.designHead!, {});
      const b = await newTask(as.designHead!, {});
      const c = await newTask(as.designHead!, {});
      await as.designHead!.from('task_dependencies').insert({ task_id: a.data!.id, depends_on_task_id: b.data!.id });
      await as.designHead!.from('task_dependencies').insert({ task_id: b.data!.id, depends_on_task_id: c.data!.id });

      const { error } = await as.designHead!
        .from('task_dependencies')
        .insert({ task_id: c.data!.id, depends_on_task_id: a.data!.id });

      expect(error?.message).toContain('waiting for each other');
    });

    it('stops a task completing while a subtask is open', async () => {
      const parent = await newTask(as.designHead!, { assignee_id: ids.designer! });
      const child = await newTask(as.designHead!, { assignee_id: ids.developer!, parent_task_id: parent.data!.id });
      await moveToReview(parent.data!.id, as.designer!);

      const blocked = await setStatus(as.designHead!, parent.data!.id, 'completed');
      expect(blocked.error?.message).toContain('Finish the subtasks');

      await moveToReview(child.data!.id, as.developer!);
      await setStatus(as.designHead!, child.data!.id, 'completed');

      expect((await setStatus(as.designHead!, parent.data!.id, 'completed')).error).toBeNull();
    });

    it('schedules the next run of a recurring task, with its checklist', async () => {
      const title = `Weekly report ${runId}`;
      const { data } = await newTask(as.designHead!, {
        title,
        assignee_id: ids.designer!,
        recurrence: 'weekly',
        due_date: '2030-01-07',
      });
      await as.designHead!.from('task_checklist_items').insert({ task_id: data!.id, label: 'Check numbers', is_done: true });
      await moveToReview(data!.id, as.designer!);
      await setStatus(as.designHead!, data!.id, 'completed');

      const { data: next } = await admin.from('tasks').select('*, task_checklist_items(label, is_done)').eq('title', title).neq('id', data!.id).single();

      expect(next?.due_date).toBe('2030-01-14');
      expect(next?.status).toBe('assigned');
      expect(next?.created_by).toBe(ids.designHead);
      expect(next?.task_checklist_items).toEqual([{ label: 'Check numbers', is_done: false }]);
    });
  });

  describe('escalation', () => {
    it('lets an assignee escalate up the reporting line, and that person can then see it', async () => {
      const { data } = await newTask(as.manager!, { assignee_id: ids.designHead! });

      const { error } = await as.designHead!
        .from('tasks')
        .update({ escalated_to: ids.founder!, escalation_reason: 'Blocked' })
        .eq('id', data!.id);

      expect(error).toBeNull();
      expect((await taskRow(data!.id)).escalated_at).not.toBeNull();
    });

    it('stops escalating sideways', async () => {
      const { data } = await newTask(as.designHead!, { assignee_id: ids.designer! });

      const { error } = await as.designer!.from('tasks').update({ escalated_to: ids.developer! }).eq('id', data!.id);

      expect(error?.message).toContain('up the reporting line');
    });
  });

  describe('comments', () => {
    it('records the real author and lets only them edit it', async () => {
      const { data: task } = await newTask(as.designHead!, { assignee_id: ids.designer! });
      const { data: comment } = await as.designer!
        .from('task_comments')
        .insert({ task_id: task!.id, body: 'Started', created_by: ids.founder! })
        .select('id, created_by')
        .single();

      expect(comment?.created_by).toBe(ids.designer);

      const { data: edited } = await as.designHead!
        .from('task_comments')
        .update({ body: 'Changed' })
        .eq('id', comment!.id)
        .select('id');

      expect(edited ?? []).toEqual([]);
    });

    it('stops people who cannot see a task commenting on it', async () => {
      const { data: task } = await newTask(as.designHead!, { assignee_id: ids.designer! });

      const { error } = await as.developer!.from('task_comments').insert({ task_id: task!.id, body: 'Hello' });

      expect(error?.code).toBe('42501');
    });
  });

  describe('workload', () => {
    it('limits figures to the viewer scope', async () => {
      const head = await as.designHead!.rpc('get_workload_rows');
      const founder = await as.founder!.rpc('get_workload_rows');
      const employee = await as.designer!.rpc('get_workload_rows');

      const headPeople = new Set(head.data?.map((row) => row.employee_id));

      expect(headPeople.has(ids.designer!)).toBe(true);
      expect(headPeople.has(ids.marketer!)).toBe(false);
      expect(new Set(founder.data?.map((row) => row.employee_id)).has(ids.marketer!)).toBe(true);
      expect(employee.data).toEqual([]);
    });
  });
});
