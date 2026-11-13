// Chat cards (contacts, polls, events), read ticks, availability and task reviewers,
// tested as real signed-in users.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();

describe('chat, availability and reviewers', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let direct = '';

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('head', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'head');
    await people.addPerson('developer', 'Employee', 'Design & Development', 'head');
    await people.addPerson('outsider', 'Employee', 'Finance', 'founder');

    const { data } = await as.designer!.rpc('get_or_create_direct_conversation', { p_other: ids.developer! });
    direct = data as string;
  });

  async function send(key: string, values: Record<string, unknown>) {
    return as[key]!
      .from('messages')
      .insert({ conversation_id: direct, ...values } as never)
      .select('id')
      .single();
  }

  describe('read ticks', () => {
    it('counts a message as seen only once the other person has read it', async () => {
      const { data: message } = await send('designer', { body: 'Are you there?' });
      const { data: sent } = await admin.from('messages').select('created_at').eq('id', message!.id).single();

      const before = await as.designer!.rpc('get_conversation_read_state', { p_conversation: direct });
      expect(before.data?.[0]?.others).toBe(1);
      // Never opened: no read position yet.
      expect(String(before.data![0]!.everyone_read_at)).toBe('-infinity');

      await as.developer!.rpc('mark_conversation_read', { p_conversation: direct });
      const after = await as.designer!.rpc('get_conversation_read_state', { p_conversation: direct });
      expect(new Date(after.data![0]!.everyone_read_at).getTime()).toBeGreaterThanOrEqual(new Date(sent!.created_at).getTime());
    });

    it('tells nobody outside the conversation', async () => {
      const { data } = await as.outsider!.rpc('get_conversation_read_state', { p_conversation: direct });
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe('contact cards, polls and events', () => {
    it('shares a colleague as a contact card, and shows it in the conversation list', async () => {
      const { error } = await send('designer', { contact_employee_id: ids.head! });
      expect(error).toBeNull();

      const { data } = await as.developer!.rpc('get_my_conversations');
      const row = (data ?? []).find((conversation) => conversation.id === direct);
      expect(row?.last_message_body).toContain('Contact: ');
      expect(row?.other_person_id).toBe(ids.designer);
    });

    it('runs a single-answer poll', async () => {
      const { data: poll, error } = await send('designer', {
        poll_question: 'Lunch?',
        poll_options: ['Biryani', 'Dosa'],
      });
      expect(error).toBeNull();

      expect((await as.developer!.rpc('vote_in_poll', { p_message: poll!.id, p_options: [1] })).error).toBeNull();
      const twice = await as.developer!.rpc('vote_in_poll', { p_message: poll!.id, p_options: [0, 1] });
      expect(twice.error?.message).toContain('takes one answer');

      // Changing your mind replaces the vote.
      await as.developer!.rpc('vote_in_poll', { p_message: poll!.id, p_options: [0] });
      const { data: votes } = await as.designer!.from('message_poll_votes').select('option_index').eq('message_id', poll!.id);
      expect(votes).toEqual([{ option_index: 0 }]);
    });

    it('lets a multi-answer poll take several, and keeps outsiders out', async () => {
      const { data: poll } = await send('designer', {
        poll_question: 'Which days?',
        poll_options: ['Mon', 'Tue', 'Wed'],
        poll_allows_multiple: true,
      });

      expect((await as.designer!.rpc('vote_in_poll', { p_message: poll!.id, p_options: [0, 2] })).error).toBeNull();
      expect((await as.outsider!.rpc('vote_in_poll', { p_message: poll!.id, p_options: [1] })).error?.message).toContain(
        'cannot vote',
      );
      expect((await as.outsider!.from('message_poll_votes').select('employee_id').eq('message_id', poll!.id)).data).toEqual([]);
    });

    it('refuses a poll with repeated options, and any change to a sent poll', async () => {
      const repeated = await send('designer', { poll_question: 'Pick', poll_options: ['Yes', 'yes'] });
      expect(repeated.error?.message).toContain('different');

      const { data: poll } = await send('designer', { poll_question: 'Pick one', poll_options: ['A', 'B'] });
      const changed = await as.designer!.from('messages').update({ poll_options: ['A', 'C'] } as never).eq('id', poll!.id);
      expect(changed.error?.message).toContain('cannot be changed');
    });

    it('schedules an event from the chat and invites everyone in it', async () => {
      const starts = new Date(Date.now() + 86_400_000);
      const ends = new Date(starts.getTime() + 30 * 60_000);
      const { data: meetingId, error } = await as.designer!.rpc('post_conversation_event', {
        p_conversation: direct,
        p_title: 'Quick sync',
        p_starts_at: starts.toISOString(),
        p_ends_at: ends.toISOString(),
      });
      expect(error).toBeNull();

      const { data: invited } = await admin.from('meeting_participants').select('employee_id').eq('meeting_id', meetingId as string);
      expect((invited ?? []).map((row) => row.employee_id)).toEqual([ids.developer]);

      const { data: card } = await as.developer!.from('messages').select('meeting:meetings(title)').eq('meeting_id', meetingId as string).single();
      expect(card?.meeting?.title).toBe('Quick sync');
    });

    it('stops anyone outside the conversation posting an event in it', async () => {
      const { error } = await as.outsider!.rpc('post_conversation_event', {
        p_conversation: direct,
        p_title: 'Not mine',
        p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        p_ends_at: new Date(Date.now() + 90_000_000).toISOString(),
      });
      expect(error?.message).toContain('cannot schedule');
    });
  });

  describe('availability', () => {
    async function statusOf(viewer: string, person: string) {
      const { data } = await as[viewer]!.rpc('get_presence', { p_employees: [ids[person]!] });
      return data?.[0]?.status;
    }

    it('shows someone offline until their app checks in, then available', async () => {
      expect(await statusOf('developer', 'outsider')).toBe('offline');
      await as.outsider!.rpc('record_presence', { p_active: true });
      expect(await statusOf('developer', 'outsider')).toBe('available');
    });

    it('keeps an app checking in from the background (every 4 minutes) as away, not offline', async () => {
      const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
      await as.outsider!.rpc('record_presence', { p_active: true });

      await admin.from('employee_presence').update({ last_seen_at: minutesAgo(4), last_active_at: minutesAgo(10) }).eq('employee_id', ids.outsider!);
      expect(await statusOf('developer', 'outsider')).toBe('away');

      await admin.from('employee_presence').update({ last_seen_at: minutesAgo(7) }).eq('employee_id', ids.outsider!);
      expect(await statusOf('developer', 'outsider')).toBe('offline');
    });

    it('shows the status someone chooses, and resets to automatic', async () => {
      await as.designer!.rpc('record_presence', { p_active: true });
      for (const status of ['busy', 'do_not_disturb', 'be_right_back', 'away']) {
        await as.designer!.rpc('set_my_status', { p_status: status });
        expect(await statusOf('head', 'designer')).toBe(status);
      }
      await as.designer!.rpc('set_my_status', { p_status: 'offline' });
      expect(await statusOf('head', 'designer')).toBe('offline');

      await as.designer!.rpc('set_my_status', { p_status: null as unknown as string });
      expect(await statusOf('head', 'designer')).toBe('available');
    });

    it('refuses a made-up status, and keeps the table itself closed', async () => {
      expect((await as.designer!.rpc('set_my_status', { p_status: 'invisible' })).error?.message).toContain('valid status');
      expect((await as.designer!.from('employee_presence').select('employee_id')).error).not.toBeNull();
    });
  });

  describe('pinned chats', () => {
    it('pins a chat to the top of your own list only', async () => {
      const { data: group } = await as.designer!.rpc('create_group_conversation', { p_title: `Pin group ${runId}`, p_members: [ids.developer!] });
      expect(group).toBeTruthy();
      const pinned = await as.designer!.from('conversation_pins').insert({ conversation_id: direct, employee_id: ids.designer! }).select('conversation_id');
      expect(pinned.data).toHaveLength(1);

      const mine = (await as.designer!.rpc('get_my_conversations')).data ?? [];
      expect(mine[0]?.id).toBe(direct);
      expect(mine[0]?.is_pinned).toBe(true);
      // The other person's list is unchanged.
      const theirs = (await as.developer!.rpc('get_my_conversations')).data ?? [];
      expect(theirs.find((row) => row.id === direct)?.is_pinned).toBe(false);
    });

    it('refuses pinning a chat you are not in, or for someone else', async () => {
      expect((await as.outsider!.from('conversation_pins').insert({ conversation_id: direct, employee_id: ids.outsider! })).error).not.toBeNull();
      expect((await as.developer!.from('conversation_pins').insert({ conversation_id: direct, employee_id: ids.designer! })).error).not.toBeNull();
      expect((await as.developer!.from('conversation_pins').select('employee_id')).data).toEqual([]);
    });
  });

  describe('task reviewers', () => {
    async function newTask(key: string, values: Record<string, unknown>) {
      return as[key]!
        .from('tasks')
        .insert({ title: `Review rule ${Math.random().toString(36).slice(2)}`, ...values } as never)
        .select('id')
        .single();
    }

    it('lets someone who manages tasks review', async () => {
      const { error } = await newTask('founder', { assignee_id: ids.designer!, reviewer_id: ids.head! });
      expect(error).toBeNull();
    });

    it('refuses a team member as reviewer', async () => {
      const { error } = await newTask('founder', { assignee_id: ids.designer!, reviewer_id: ids.developer! });
      expect(error?.message).toContain('Choose a reviewer who manages work');
    });

    it('lets whoever assigned the task review it, even without manager access', async () => {
      const { error } = await newTask('designer', { assignee_id: ids.designer!, reviewer_id: ids.designer! });
      expect(error).toBeNull();
    });

    it('lists only people who manage tasks as reviewers', async () => {
      const { data } = await as.designer!.rpc('get_reviewer_ids');
      const reviewers = new Set(data ?? []);
      expect(reviewers.has(ids.founder!) && reviewers.has(ids.head!)).toBe(true);
      expect(reviewers.has(ids.developer!) || reviewers.has(ids.outsider!)).toBe(false);
    });
  });
});
