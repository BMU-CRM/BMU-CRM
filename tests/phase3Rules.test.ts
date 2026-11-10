// Files, messages and notifications, tested as real signed-in users against a real
// database, because these rules must hold even if someone bypasses the app.
import { beforeAll, describe, expect, it } from 'vitest';
import { anonymousClient, canDownload, createTestPeople, uploadAs, type Client } from './helpers/testDatabase';

const runId = Date.now();

describe('files, messages and notifications', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  const fileIds: string[] = [];
  let designDepartment = '';

  async function newFile(actor: Client, name = 'brief.pdf', extra: Record<string, unknown> = {}) {
    const { data, error } = await actor.from('files').insert({ name, ...extra }).select('*').single();
    if (data) fileIds.push(data.id);
    return { data, error };
  }

  // Creates the record, uploads real bytes through a signed link, and confirms it.
  async function uploadFile(actor: Client, name = 'brief.pdf', extra: Record<string, unknown> = {}) {
    const { data: file } = await newFile(actor, name, extra);
    const { data: version, error: versionError } = await actor
      .from('file_versions')
      .insert({ file_id: file!.id, original_name: name })
      .select('id, storage_path')
      .single();
    if (versionError) throw versionError;

    const upload = await uploadAs(actor, version!.storage_path, '%PDF-1.4 test content', 'application/pdf');
    if (upload.error) throw upload.error;

    const { error } = await actor.rpc('finalize_file_version', { p_version: version!.id });
    if (error) throw error;
    return { fileId: file!.id, path: version!.storage_path };
  }

  async function notificationsFor(key: string) {
    const { data } = await admin
      .from('notifications')
      .select('kind, title, body, event_count, priority, read_at')
      .eq('recipient_id', ids[key]!)
      .order('created_at', { ascending: false });
    return data ?? [];
  }

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('designHead', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'designHead');
    await people.addPerson('developer', 'Employee', 'Design & Development', 'designHead');
    await people.addPerson('marketer', 'Employee', 'Digital Marketing', 'founder');
    designDepartment = await people.departmentId('Design & Development');
  });

  describe('anonymous visitors', () => {
    it.each(['files', 'file_shares', 'file_versions', 'messages', 'conversations', 'notifications', 'push_subscriptions'] as const)(
      'cannot read %s',
      async (table) => {
        const { error } = await anonymousClient().from(table).select('*').limit(1);

        expect(error?.code).toBe('42501');
      },
    );

    it('cannot download from storage', async () => {
      const { fileId, path } = await uploadFile(as.designer!);

      expect(fileId).toBeTruthy();
      expect(await canDownload(anonymousClient(), path)).toBe(false);
    });
  });

  describe('files', () => {
    it('records the real owner and source department, whatever is sent', async () => {
      const { data } = await newFile(as.designer!, 'plan.pdf', { owner_id: ids.founder!, status: 'ready', size_bytes: 1 });

      expect(data?.owner_id).toBe(ids.designer);
      expect(data?.department_id).toBe(designDepartment);
      expect(data?.status).toBe('uploading');
      expect(data?.size_bytes).toBeNull();
    });

    it('refuses programs and web pages', async () => {
      for (const name of ['setup.exe', 'page.html', 'script.js', 'image.svg']) {
        const { error } = await newFile(as.designer!, name);
        expect(error, name).not.toBeNull();
      }
    });

    it('takes the size from Storage, not from the browser', async () => {
      const { fileId } = await uploadFile(as.designer!);
      const { data } = await admin.from('files').select('status, size_bytes, mime_type').eq('id', fileId).single();

      expect(data).toEqual({ status: 'ready', size_bytes: 21, mime_type: 'application/pdf' });
    });

    it('stops an upload that was never completed from being confirmed', async () => {
      const { data: file } = await newFile(as.designer!);
      const { data: version } = await as.designer!
        .from('file_versions')
        .insert({ file_id: file!.id, original_name: 'brief.pdf' })
        .select('id')
        .single();

      const { error } = await as.designer!.rpc('finalize_file_version', { p_version: version!.id });

      expect(error?.message).toContain('not finished uploading');
    });

    it('refuses a file type the bucket does not allow, even with a safe-looking name', async () => {
      const { data: file } = await newFile(as.designer!, 'notes.txt');
      const { data: version } = await as.designer!
        .from('file_versions')
        .insert({ file_id: file!.id, original_name: 'notes.txt' })
        .select('storage_path')
        .single();
      const upload = await uploadAs(as.designer!, version!.storage_path, '<script>', 'text/html');

      expect(upload.error).not.toBeNull();
    });

    it('stops anyone uploading into someone else\'s file', async () => {
      const { data: file } = await newFile(as.designer!);
      const { data: version } = await as.designer!
        .from('file_versions')
        .insert({ file_id: file!.id, original_name: 'brief.pdf' })
        .select('storage_path')
        .single();

      const upload = await uploadAs(as.developer!, version!.storage_path, '%PDF-1.4', 'application/pdf');
      const ownVersion = await as.developer!.from('file_versions').insert({ file_id: file!.id, original_name: 'x.pdf' });

      expect(upload.error).not.toBeNull();
      expect(ownVersion.error?.code).toBe('42501');
    });

    it('stops a forged storage path', async () => {
      const { data } = await as.designer!
        .from('file_versions')
        .insert({ file_id: (await newFile(as.designer!)).data!.id, original_name: '../../evil.pdf', storage_path: 'elsewhere/evil.pdf' })
        .select('storage_path, version')
        .single();

      expect(data?.storage_path).toMatch(/^[0-9a-f-]{36}\/v1\/\.\._\.\._evil\.pdf$/);
    });

    it('keeps a file private until it is shared', async () => {
      const { fileId, path } = await uploadFile(as.designer!);

      expect((await as.developer!.from('files').select('id').eq('id', fileId)).data).toEqual([]);
      expect(await canDownload(as.developer!, path)).toBe(false);

      await as.designer!.from('file_shares').insert({ file_id: fileId, recipient_employee_id: ids.developer! });

      expect((await as.developer!.from('files').select('id').eq('id', fileId)).data).toHaveLength(1);
      expect(await canDownload(as.developer!, path)).toBe(true);
    });

    it('records who sent a file, with their title and department', async () => {
      const { fileId } = await uploadFile(as.designHead!);
      const { data } = await as.designHead!
        .from('file_shares')
        .insert({ file_id: fileId, recipient_employee_id: ids.designer!, sender_name: 'Forged' })
        .select('shared_by, sender_name, sender_department')
        .single();

      expect(data).toEqual({ shared_by: ids.designHead, sender_name: 'Test designHead', sender_department: 'Design & Development' });
    });

    it('shares with a whole department', async () => {
      const { fileId } = await uploadFile(as.marketer!);
      await as.marketer!.from('file_shares').insert({ file_id: fileId, recipient_department_id: designDepartment });

      expect((await as.designer!.from('files').select('id').eq('id', fileId)).data).toHaveLength(1);
      expect((await as.developer!.from('files').select('id').eq('id', fileId)).data).toHaveLength(1);
    });

    it('stops access once a share expires', async () => {
      const { fileId } = await uploadFile(as.designer!);
      await as.designer!.from('file_shares').insert({
        file_id: fileId,
        recipient_employee_id: ids.marketer!,
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      });

      expect((await as.marketer!.from('files').select('id').eq('id', fileId)).data).toEqual([]);
    });

    it('stops anyone but the owner sharing or changing a file', async () => {
      const { fileId } = await uploadFile(as.designer!);
      await as.designer!.from('file_shares').insert({ file_id: fileId, recipient_employee_id: ids.developer! });

      const share = await as.developer!.from('file_shares').insert({ file_id: fileId, recipient_employee_id: ids.marketer! });
      const rename = await as.developer!.from('files').update({ name: 'stolen.pdf' }).eq('id', fileId).select('id');

      expect(share.error?.code).toBe('42501');
      expect(rename.data ?? []).toEqual([]);
    });

    it('stops the owner faking the size or status', async () => {
      const { fileId } = await uploadFile(as.designer!);

      const { error } = await as.designer!.from('files').update({ size_bytes: 1 }).eq('id', fileId);

      expect(error?.code).toBe('42501');
    });

    it('shows task attachments to people who can see the task', async () => {
      const { data: task } = await as.designHead!.from('tasks').insert({ title: 'With file', assignee_id: ids.designer! }).select('id').single();
      const { fileId } = await uploadFile(as.designHead!, 'spec.pdf', { task_id: task!.id });

      expect((await as.designer!.from('files').select('id').eq('id', fileId)).data).toHaveLength(1);
      expect((await as.marketer!.from('files').select('id').eq('id', fileId)).data).toEqual([]);
    });

    it('stops attaching files to a task you cannot see', async () => {
      const { data: task } = await as.designHead!.from('tasks').insert({ title: 'Private', assignee_id: ids.designer! }).select('id').single();

      const { error } = await newFile(as.marketer!, 'x.pdf', { task_id: task!.id });

      expect(error?.message).toContain('cannot attach files');
    });

    it('gives a head department-wide file access', async () => {
      const { fileId } = await uploadFile(as.designer!);

      expect((await as.designHead!.from('files').select('id').eq('id', fileId)).data).toHaveLength(1);
      expect((await as.marketer!.from('files').select('id').eq('id', fileId)).data).toEqual([]);
    });

    it('tracks access, visible to the owner only', async () => {
      const { fileId } = await uploadFile(as.designer!);
      await as.designer!.from('file_shares').insert({ file_id: fileId, recipient_employee_id: ids.developer! });
      await as.developer!.rpc('record_file_access', { p_file: fileId, p_action: 'download', p_version: 1 });

      const owner = await as.designer!.from('file_access_logs').select('employee_name, action').eq('file_id', fileId);
      const viewer = await as.developer!.from('file_access_logs').select('id').eq('file_id', fileId);
      const outsider = await as.marketer!.rpc('record_file_access', { p_file: fileId, p_action: 'view', p_version: 1 });

      expect(owner.data).toEqual([{ employee_name: 'Test developer', action: 'download' }]);
      expect(viewer.data).toEqual([]);
      expect(outsider.error?.code).toBe('42501');
    });
  });

  describe('messages', () => {
    let directId = '';

    it('gives each pair of people one direct conversation', async () => {
      const first = await as.designer!.rpc('get_or_create_direct_conversation', { p_other: ids.developer! });
      const second = await as.developer!.rpc('get_or_create_direct_conversation', { p_other: ids.designer! });

      expect(first.data).toBe(second.data);
      directId = first.data!;
    });

    it('keeps direct messages private', async () => {
      await as.designer!.from('messages').insert({ conversation_id: directId, body: 'Private hello' });

      expect((await as.developer!.from('messages').select('body').eq('conversation_id', directId)).data).toHaveLength(1);
      expect((await as.designHead!.from('messages').select('body').eq('conversation_id', directId)).data).toEqual([]);
      expect((await as.founder!.from('messages').select('body').eq('conversation_id', directId)).data).toEqual([]);
    });

    it('stops outsiders posting and records the real author', async () => {
      const outsider = await as.marketer!.from('messages').insert({ conversation_id: directId, body: 'Hi' });
      const { data } = await as.developer!
        .from('messages')
        .insert({ conversation_id: directId, body: 'Reply', author_id: ids.founder! })
        .select('author_id')
        .single();

      expect(outsider.error?.code).toBe('42501');
      expect(data?.author_id).toBe(ids.developer);
    });

    it('limits a department channel to that department', async () => {
      const { data: channel } = await admin.from('conversations').select('id').eq('department_id', designDepartment).single();

      const member = await as.designer!.from('messages').insert({ conversation_id: channel!.id, body: 'Team update' });
      const outsider = await as.marketer!.from('messages').select('id').eq('conversation_id', channel!.id);

      expect(member.error).toBeNull();
      expect(outsider.data).toEqual([]);
    });

    it('creates a channel for each new project, open to its team', async () => {
      const { data: project } = await as.designHead!
        .from('projects')
        .insert({ name: `Chat project ${runId}`, department_id: designDepartment })
        .select('id')
        .single();
      await as.designHead!.from('project_members').insert({ project_id: project!.id, employee_id: ids.designer! });
      const { data: channel } = await admin.from('conversations').select('id').eq('project_id', project!.id).single();

      expect((await as.designer!.from('messages').insert({ conversation_id: channel!.id, body: 'Kick-off' })).error).toBeNull();
      expect((await as.marketer!.from('conversations').select('id').eq('id', channel!.id)).data).toEqual([]);

      await admin.from('projects').delete().eq('id', project!.id);
    });

    it('lets only authors edit, and deleting keeps the original in the audit log', async () => {
      const { data: message } = await as.designer!
        .from('messages')
        .insert({ conversation_id: directId, body: 'Original words' })
        .select('id')
        .single();

      const edit = await as.developer!.from('messages').update({ body: 'Changed' }).eq('id', message!.id);
      expect(edit.error?.message).toContain('only edit your own');

      await as.designer!.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', message!.id);
      const { data: after } = await admin.from('messages').select('body, deleted_by').eq('id', message!.id).single();
      const { data: audit } = await admin
        .from('audit_logs')
        .select('details')
        .eq('entity_type', 'messages')
        .eq('entity_id', message!.id)
        .single();

      expect(after).toEqual({ body: '', deleted_by: ids.designer });
      expect(audit?.details).toHaveProperty('changes.body.from', 'Original words');
    });

    it('lets only announcers post announcements, and tells everyone', async () => {
      const { data: channel } = await admin.from('conversations').select('id').eq('kind', 'announcement').single();

      const employee = await as.designer!.from('messages').insert({ conversation_id: channel!.id, body: 'Hi all' });
      const founder = await as.founder!.from('messages').insert({ conversation_id: channel!.id, body: `Office closed ${runId}` });

      expect(employee.error?.code).toBe('42501');
      expect(founder.error).toBeNull();
      expect((await notificationsFor('marketer')).some((n) => n.kind === 'announcement' && n.body?.includes(String(runId)))).toBe(true);
    });

    it('notifies people who are @mentioned', async () => {
      const { data: channel } = await admin.from('conversations').select('id').eq('department_id', designDepartment).single();
      await as.designer!.from('messages').insert({ conversation_id: channel!.id, body: `@Test developer please check ${runId}` });

      const mention = (await notificationsFor('developer')).find((n) => n.kind === 'mention');

      expect(mention?.priority).toBe('high');
      expect((await notificationsFor('designHead')).some((n) => n.body?.includes(`please check ${runId}`))).toBe(false);
    });

    it('groups a burst of messages into one notification', async () => {
      const conversation = (await as.marketer!.rpc('get_or_create_direct_conversation', { p_other: ids.founder! })).data!;
      for (const body of ['One', 'Two', 'Three']) {
        const { error } = await as.marketer!.from('messages').insert({ conversation_id: conversation, body });
        expect(error, body).toBeNull();
      }

      const unread = (await notificationsFor('founder')).filter((n) => n.kind === 'message_received' && !n.read_at);

      expect(unread).toHaveLength(1);
      expect(unread[0]).toMatchObject({ event_count: 3, body: 'Three' });
    });

    it('counts unread messages and clears them when read', async () => {
      const conversation = (await as.marketer!.rpc('get_or_create_direct_conversation', { p_other: ids.designHead! })).data!;
      await as.marketer!.from('messages').insert({ conversation_id: conversation, body: 'Ping' });

      const before = (await as.designHead!.rpc('get_my_conversations')).data!.find((c) => c.id === conversation);
      await as.designHead!.rpc('mark_conversation_read', { p_conversation: conversation });
      const after = (await as.designHead!.rpc('get_my_conversations')).data!.find((c) => c.id === conversation);

      expect(before?.unread_count).toBe(1);
      expect(after?.unread_count).toBe(0);
    });
  });

  describe('notifications', () => {
    it('follows a task through its workflow, and never notifies people about their own actions', async () => {
      const { data: task } = await as.designHead!.from('tasks').insert({ title: `Notify ${runId}`, assignee_id: ids.designer! }).select('id').single();
      for (const status of ['accepted', 'in_progress', 'under_review']) {
        await as.designer!.from('tasks').update({ status: status as never }).eq('id', task!.id);
      }
      await as.designHead!.from('tasks').update({ status: 'completed' }).eq('id', task!.id);

      const designer = (await notificationsFor('designer')).filter((n) => n.body === `Notify ${runId}`).map((n) => n.kind);
      const head = (await notificationsFor('designHead')).filter((n) => n.body === `Notify ${runId}`).map((n) => n.kind);

      expect(designer.sort()).toEqual(['task_assigned', 'task_completed']);
      expect(head).toEqual(['task_review_requested']);
    });

    it('keeps notifications private and lets people change only the read status', async () => {
      const mine = await as.designer!.from('notifications').select('id, recipient_id').limit(1).single();
      const others = await as.marketer!.from('notifications').select('id').eq('id', mine.data!.id);
      const edit = await as.designer!.from('notifications').update({ title: 'Changed' }).eq('id', mine.data!.id);
      const read = await as.designer!.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', mine.data!.id);

      expect(others.data).toEqual([]);
      expect(edit.error?.message).toContain('Only the read status');
      expect(read.error).toBeNull();
    });

    it('sends deadline reminders once, and escalates overdue work to the manager', async () => {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const daysAgo = (days: number) => new Date(new Date(today).getTime() - days * 86_400_000).toISOString().slice(0, 10);

      const { data: soon } = await as.designHead!.from('tasks').insert({ title: `Soon ${runId}`, assignee_id: ids.designer!, due_date: today }).select('id').single();
      const { data: late } = await as.designHead!.from('tasks').insert({ title: `Late ${runId}`, assignee_id: ids.designer!, due_date: daysAgo(3) }).select('id').single();

      await admin.rpc('process_task_deadlines');
      await admin.rpc('process_task_deadlines');

      const designer = await notificationsFor('designer');
      const lateTask = await admin.from('tasks').select('escalated_to, escalation_reason').eq('id', late!.id).single();

      expect(designer.filter((n) => n.kind === 'task_due_soon' && n.body === `Soon ${runId}`)).toHaveLength(1);
      expect(designer.filter((n) => n.kind === 'task_overdue' && n.body === `Late ${runId}`)).toHaveLength(1);
      expect(lateTask.data?.escalated_to).toBe(ids.designHead);
      expect(lateTask.data?.escalation_reason).toContain('Automatically escalated');
      expect(soon).toBeTruthy();
    });

    it('stops users running the deadline job or pointing the database elsewhere', async () => {
      const deadlines = await as.founder!.rpc('process_task_deadlines' as never);
      const dispatch = await as.founder!.rpc('configure_notification_dispatch' as never, { p_url: 'https://evil.example', p_secret: 'x' } as never);

      expect(deadlines.error).not.toBeNull();
      expect(dispatch.error).not.toBeNull();
    });

    it('only accepts secure push addresses', async () => {
      const { error } = await as.designer!.rpc('save_push_subscription', {
        p_endpoint: 'http://insecure.example/push',
        p_p256dh: 'x',
        p_auth: 'y',
        p_user_agent: 'test',
      });

      expect(error?.message).toContain('not valid');
    });
  });
});
