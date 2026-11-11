// WhatsApp-style message actions (5-minute edit and delete, delete for me, star,
// message info, delivery ticks) and task times, tested as real signed-in users.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();

describe('message actions and task times', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let direct = '';

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('sender', 'Employee', 'Design & Development', 'founder');
    await people.addPerson('reader', 'Employee', 'Design & Development', 'founder');
    await people.addPerson('outsider', 'Employee', 'Finance', 'founder');
    const { data } = await as.sender!.rpc('get_or_create_direct_conversation', { p_other: ids.reader! });
    direct = data as string;
  });

  async function send(body: string) {
    const { data } = await as.sender!.from('messages').insert({ conversation_id: direct, body }).select('id').single();
    return data!.id;
  }

  // Makes a message look older than the five-minute window, as if sent earlier.
  async function age(messageId: string) {
    await admin.from('messages').update({ created_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq('id', messageId);
  }

  describe('edit and delete for everyone', () => {
    it('allows both within five minutes', async () => {
      const id = await send('Typo hree');
      expect((await as.sender!.from('messages').update({ body: 'Typo here' }).eq('id', id).select('id')).error).toBeNull();
      expect((await as.sender!.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id')).error).toBeNull();
    });

    it('refuses both after five minutes', async () => {
      const id = await send('Old news');
      await age(id);
      const edit = await as.sender!.from('messages').update({ body: 'Changed' }).eq('id', id);
      const remove = await as.sender!.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      expect(edit.error?.message).toContain('within 5 minutes');
      expect(remove.error?.message).toContain('within 5 minutes');
    });

    it('never lets someone delete another person\'s message for everyone', async () => {
      const id = await send('Mine');
      const { error } = await as.reader!.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      expect(error?.message).toContain('your own messages');
    });

    it('keeps the forwarded mark fixed', async () => {
      const { data } = await as.sender!
        .from('messages')
        .insert({ conversation_id: direct, body: 'Passed on', forwarded: true })
        .select('id')
        .single();
      const { error } = await as.sender!.from('messages').update({ forwarded: false }).eq('id', data!.id);
      expect(error?.message).toContain('cannot be changed');
    });
  });

  describe('delete for me and stars', () => {
    it('hides a message from one person only', async () => {
      const id = await send('Hide me');
      await age(id);
      expect((await as.reader!.from('message_hidden').insert({ message_id: id, employee_id: ids.reader! }).select('message_id')).error).toBeNull();
      expect((await as.sender!.from('message_hidden').select('message_id').eq('message_id', id)).data).toEqual([]);
    });

    it('stops anyone hiding or starring for someone else, or for a chat they cannot see', async () => {
      const id = await send('Not yours');
      const forOther = await as.reader!.from('message_hidden').insert({ message_id: id, employee_id: ids.sender! });
      const outsiderStar = await as.outsider!.from('message_stars').insert({ message_id: id, employee_id: ids.outsider! });
      expect(forOther.error).not.toBeNull();
      expect(outsiderStar.error).not.toBeNull();
    });

    it('keeps stars private', async () => {
      const id = await send('Star me');
      await as.reader!.from('message_stars').insert({ message_id: id, employee_id: ids.reader! });
      expect((await as.reader!.from('message_stars').select('message_id').eq('message_id', id)).data).toHaveLength(1);
      expect((await as.sender!.from('message_stars').select('message_id').eq('message_id', id)).data).toEqual([]);
    });
  });

  describe('message info and ticks', () => {
    it('shows the author who read the message and when, and nobody else can ask', async () => {
      const id = await send('Did you read this?');

      const before = await as.sender!.rpc('get_message_info', { p_message: id });
      expect(before.data?.[0]?.read_at).toBeNull();

      await as.reader!.rpc('mark_conversation_read', { p_conversation: direct });
      const after = await as.sender!.rpc('get_message_info', { p_message: id });
      expect(after.data?.[0]?.employee_id).toBe(ids.reader);
      expect(after.data?.[0]?.read_at).not.toBeNull();
      expect(after.data?.[0]?.delivered).toBe(true);

      expect((await as.reader!.rpc('get_message_info', { p_message: id })).data).toEqual([]);
    });

    it('counts a message delivered once the other person\'s app checks in', async () => {
      const id = await send('Delivered?');
      const { data: sent } = await admin.from('messages').select('created_at').eq('id', id).single();

      await as.reader!.rpc('record_presence', { p_active: false });
      const { data } = await as.sender!.rpc('get_conversation_read_state', { p_conversation: direct });
      expect(new Date(data![0]!.everyone_delivered_at).getTime()).toBeGreaterThanOrEqual(new Date(sent!.created_at).getTime());
    });
  });

  describe('clear chat and exit group', () => {
    it('clears a chat for one person only', async () => {
      const id = await send('Before clearing');
      const { data: count, error } = await as.reader!.rpc('clear_conversation_for_me', { p_conversation: direct });
      expect(error).toBeNull();
      expect(count).toBeGreaterThan(0);

      const readerHidden = await as.reader!.from('message_hidden').select('message_id').eq('message_id', id);
      const senderHidden = await as.sender!.from('message_hidden').select('message_id').eq('message_id', id);
      expect(readerHidden.data).toHaveLength(1);
      expect(senderHidden.data).toEqual([]);
    });

    it('refuses to clear a chat someone cannot see', async () => {
      const { error } = await as.outsider!.rpc('clear_conversation_for_me', { p_conversation: direct });
      expect(error?.message).toContain('cannot clear');
    });

    it('lets someone exit a group, and hands the admin role on when the last admin leaves', async () => {
      const { data: group } = await as.sender!.rpc('create_group_conversation', {
        p_title: 'Exit test',
        p_members: [ids.reader!, ids.outsider!],
      });
      const groupId = group as string;

      expect((await as.sender!.rpc('leave_group', { p_conversation: groupId })).error).toBeNull();
      const { data: members } = await admin.from('conversation_members').select('employee_id, is_admin').eq('conversation_id', groupId);
      expect((members ?? []).some((member) => member.employee_id === ids.sender)).toBe(false);
      expect((members ?? []).filter((member) => member.is_admin)).toHaveLength(1);

      expect((await as.sender!.rpc('leave_group', { p_conversation: groupId })).error?.message).toContain('not in this group');
    });
  });

  describe('task times', () => {
    it('lets someone plan their own task with a time, and move it', async () => {
      const { data, error } = await as.sender!
        .from('tasks')
        .insert({ title: 'Call the printer', assignee_id: ids.sender!, due_date: '2030-05-02', due_time: '15:30' })
        .select('id, status, due_time')
        .single();
      expect(error).toBeNull();
      expect(data?.status).toBe('accepted');
      expect(data?.due_time?.slice(0, 5)).toBe('15:30');

      const moved = await as.sender!.from('tasks').update({ due_time: '10:00' }).eq('id', data!.id).select('due_time');
      expect(moved.data?.[0]?.due_time?.slice(0, 5)).toBe('10:00');
    });

    it('refuses a time without a date, and stops others changing it', async () => {
      const noDate = await as.sender!.from('tasks').insert({ title: 'No date', assignee_id: ids.sender!, due_time: '09:00' });
      expect(noDate.error).not.toBeNull();

      const { data } = await as.founder!
        .from('tasks')
        .insert({ title: 'Founder task', assignee_id: ids.sender!, due_date: '2030-05-03', due_time: '11:00' })
        .select('id')
        .single();
      const { data: rows } = await as.reader!.from('tasks').update({ due_time: '12:00' }).eq('id', data!.id).select('id');
      expect(rows ?? []).toHaveLength(0);
    });
  });
});
