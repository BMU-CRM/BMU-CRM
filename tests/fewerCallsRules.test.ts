// Fewer calls to the website: opening a chat with nothing new changes nothing (so
// nobody's page reloads), and push notifications go to the website only when someone
// can receive them. Also the payment details filled in for documents.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestPeople, testDatabase } from './helpers/testDatabase';

const runId = Date.now();

describe('fewer calls to the website', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let direct = '';

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('alice', 'Employee', 'Design & Development', 'founder');
    await people.addPerson('bob', 'Employee', 'Design & Development', 'founder');
    direct = (await as.alice!.rpc('get_or_create_direct_conversation', { p_other: ids.bob! })).data as string;
  });

  async function readPosition(person: string) {
    const { data } = await admin.from('conversation_reads').select('last_read_at').eq('conversation_id', direct).eq('employee_id', ids[person]!).maybeSingle();
    return data?.last_read_at ?? null;
  }

  it('marks a chat read only when there is something new, so open chats stop reloading each other', async () => {
    await as.alice!.from('messages').insert({ conversation_id: direct, body: 'Hello' }).select('id');
    await as.bob!.rpc('mark_conversation_read', { p_conversation: direct });
    const first = await readPosition('bob');
    expect(first).not.toBeNull();

    // Opening it again with nothing new leaves the read position, and so tells nobody.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await as.bob!.rpc('mark_conversation_read', { p_conversation: direct });
    expect(await readPosition('bob')).toBe(first);

    // A new message moves it on.
    await as.alice!.from('messages').insert({ conversation_id: direct, body: 'Are you there?' }).select('id');
    await as.bob!.rpc('mark_conversation_read', { p_conversation: direct });
    expect(new Date((await readPosition('bob'))!).getTime()).toBeGreaterThan(new Date(first!).getTime());
  });

  it('sends a notification to the website only when someone can receive the push', async () => {
    const db = await testDatabase();
    await db.query(`insert into private.app_settings (key, value) values ('notification_dispatch_url', 'https://example.test/dispatch'), ('notification_dispatch_secret', 'secret')
                    on conflict (key) do update set value = excluded.value`);
    const queued = async (title: string) =>
      (await db.query<{ n: number }>(
        `select count(*)::int as n from net.http_request_queue q join public.notifications n on n.id = (q.body ->> 'id')::uuid where n.title = $1`,
        [title],
      )).rows[0]!.n;
    const notify = (title: string) => admin.from('notifications').insert({ recipient_id: ids.bob!, kind: 'announcement', title }).select('id');

    // No device with notifications on: nothing is sent.
    await notify(`No device ${runId}`);
    expect(await queued(`No device ${runId}`)).toBe(0);

    await admin.from('push_subscriptions').insert({ employee_id: ids.bob!, endpoint: `https://push.example.test/${runId}`, p256dh: 'key', auth: 'auth' });
    await notify(`With device ${runId}`);
    expect(await queued(`With device ${runId}`)).toBe(1);

    // "Do not disturb": nothing is sent.
    await as.bob!.rpc('set_my_status', { p_status: 'do_not_disturb' });
    await notify(`Do not disturb ${runId}`);
    expect(await queued(`Do not disturb ${runId}`)).toBe(0);
    await as.bob!.rpc('set_my_status', { p_status: null as unknown as string });

    // This kind turned off: nothing is sent.
    await admin.from('notification_preferences').upsert({ employee_id: ids.bob!, kind: 'announcement', push_enabled: false }, { onConflict: 'employee_id,kind' });
    await notify(`Turned off ${runId}`);
    expect(await queued(`Turned off ${runId}`)).toBe(0);
  });

  it('fills in the payment details printed on documents', async () => {
    const { data } = await admin.from('finance_settings').select('bank_account_name, bank_account_number, bank_ifsc, bank_swift, bank_name, upi_id').single();
    expect(data).toEqual({
      bank_account_name: 'BUILD MY UNIVERSEE',
      bank_account_number: '10270074116',
      bank_ifsc: 'IDFB0080156',
      bank_swift: 'IDFBINBBMUM',
      bank_name: 'IDFC FIRST Bank, Jayanagar Branch',
      upi_id: 'buildmyuniversee@idfcbank',
    });
    expect((await as.founder!.from('finance_settings').update({ bank_ifsc: 'NOT-AN-IFSC' }).eq('id', true).select('id')).error).not.toBeNull();
  });
});
