// The wording of a desktop or phone notification. The bell shows the stored title;
// a push names who did it and adds what matters at a glance, such as the deadline.
import { formatDate } from '@/lib/formatDate';
import type { NotificationKind } from './notificationKinds';

type PushSource = {
  kind: NotificationKind;
  title: string;
  body: string | null;
  actorName: string | null;
  eventCount: number;
  // Present when the notification is about a task.
  task?: { dueDate: string | null; priority: string } | null;
};

// Titles that read better with the person's name. Others keep their stored title,
// which already says who, such as "New message from Mukesh".
const titleWithActor: Partial<Record<NotificationKind, (actor: string) => string>> = {
  task_assigned: (actor) => `${actor} assigned you a task`,
  task_review_requested: (actor) => `${actor} sent work for your review`,
  task_changes_requested: (actor) => `${actor} asked for changes`,
  task_comment: (actor) => `${actor} commented on a task`,
  task_rescheduled: (actor) => `${actor} moved a deadline`,
  task_escalated: (actor) => `${actor} escalated a task to you`,
  task_rejected: (actor) => `${actor} declined a task you assigned`,
  file_received: (actor) => `${actor} sent you a file`,
  meeting_invited: (actor) => `${actor} invited you to a meeting`,
  meeting_changed: (actor) => `${actor} changed a meeting`,
  meeting_cancelled: (actor) => `${actor} cancelled a meeting`,
  leave_requested: (actor) => `${actor} asked for leave`,
};

const priorityWords: Record<string, string> = { high: 'High priority', urgent: 'Urgent' };

function dueText(dueDate: string, today: string) {
  if (dueDate === today) return 'Due today';
  if (dueDate < today) return `Overdue since ${formatDate(dueDate)}`;
  return `Due ${formatDate(dueDate)}`;
}

export function buildPushMessage(source: PushSource, today: string) {
  const actor = source.actorName?.trim();
  const withActor = actor ? titleWithActor[source.kind] : undefined;
  const title = withActor ? withActor(actor as string) : source.title;

  const facts: string[] = [];
  if (source.task?.dueDate && source.kind !== 'task_completed') facts.push(dueText(source.task.dueDate, today));
  const urgency = source.task ? priorityWords[source.task.priority] : undefined;
  if (urgency) facts.push(urgency);
  if (source.eventCount > 1) facts.push(`+${source.eventCount - 1} more`);

  const body = [source.body?.trim(), facts.join(' · ')].filter(Boolean).join('\n');
  return { title, body };
}
