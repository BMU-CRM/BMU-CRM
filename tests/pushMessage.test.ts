import { describe, expect, it } from 'vitest';
import { buildPushMessage } from '@/lib/notifications/pushMessage';

const today = '2026-11-11';

describe('desktop notification wording', () => {
  it('names who assigned the task and adds its deadline and priority', () => {
    const message = buildPushMessage(
      {
        kind: 'task_assigned',
        title: 'New task assigned to you',
        body: 'CRM Task Updates',
        actorName: 'Mukesh',
        eventCount: 1,
        task: { dueDate: '2026-11-14', priority: 'high' },
      },
      today,
    );

    expect(message.title).toBe('Mukesh assigned you a task');
    expect(message.body).toMatch(/^CRM Task Updates\nDue 14 Nov 2026 · High priority$/);
  });

  it('says due today or overdue in plain words, and leaves out normal priority', () => {
    const dueToday = buildPushMessage(
      { kind: 'task_due_soon', title: 'A task is due today', body: 'Report', actorName: null, eventCount: 1, task: { dueDate: today, priority: 'medium' } },
      today,
    );
    const late = buildPushMessage(
      { kind: 'task_overdue', title: 'Your task is overdue', body: 'Report', actorName: null, eventCount: 1, task: { dueDate: '2026-11-09', priority: 'urgent' } },
      today,
    );

    expect(dueToday).toEqual({ title: 'A task is due today', body: 'Report\nDue today' });
    expect(late.body).toBe('Report\nOverdue since 9 Nov 2026 · Urgent');
  });

  it('keeps titles that already say who, and counts grouped messages', () => {
    const message = buildPushMessage(
      { kind: 'message_received', title: 'New message from Dhanush', body: 'Hi', actorName: 'Dhanush', eventCount: 3 },
      today,
    );

    expect(message).toEqual({ title: 'New message from Dhanush', body: 'Hi\n+2 more' });
  });
});
