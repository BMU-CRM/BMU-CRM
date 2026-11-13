import type { Database } from '@/types/databaseTypes';

export type NotificationKind = Database['public']['Enums']['notification_kind'];

export const notificationKindLabels: Record<NotificationKind, string> = {
  task_assigned: 'A task is assigned to me',
  task_due_soon: 'A task is due today or tomorrow',
  task_overdue: 'A task is overdue',
  task_review_requested: 'Work is ready for my review',
  task_changes_requested: 'Changes are requested on my work',
  task_completed: 'A task is approved or completed',
  task_rejected: 'A task I assigned is rejected',
  task_escalated: 'A task is escalated to me',
  task_comment: 'Someone comments on my task',
  task_rescheduled: 'A task deadline is moved',
  file_received: 'I receive a file',
  message_received: 'I receive a direct or group message',
  mention: 'Someone mentions me',
  announcement: 'A company announcement is posted',
  meeting_invited: 'I am invited to a meeting',
  meeting_changed: 'A meeting I am in changes',
  meeting_cancelled: 'A meeting I am in is cancelled',
  meeting_reminder: 'A meeting is about to start',
  leave_requested: 'Someone asks me to approve leave',
  leave_decided: 'My leave is approved, rejected or cancelled',
  ticket_raised: 'A support ticket needs my attention',
  ticket_updated: 'A support ticket of mine is updated',
  payment_received: 'A client pays an invoice I look after',
  invoice_overdue: 'An invoice I look after is overdue',
  payroll_review: 'Payroll is waiting for my approval',
  payroll_decided: 'Payroll I prepared is approved or sent back',
  salary_paid: 'My salary is paid and my payslip is ready',
  candidate_added: 'A new candidate applies',
  interview_reminder: 'An interview I am on is coming up',
  resignation_submitted: 'Someone resigns',
  resignation_decided: 'My resignation is decided',
  invoice_due_soon: 'An invoice I look after is due in 3 days',
  follow_up_due: 'A payment follow-up is due',
  vendor_bill_due: 'A vendor bill is due in 3 days',
  reimbursement_submitted: 'Someone claims a reimbursement I can approve',
  reimbursement_decided: 'A reimbursement is approved, rejected or ready to pay',
  reimbursement_paid: 'My reimbursement is paid',
  budget_alert: 'A department budget is 80% used or over',
  employee_added: 'A new employee is added',
  attendance_irregularity: 'Attendance is missing a check-out',
  task_resume_requested: 'I am asked to resume a task on hold',
  task_updated: 'Someone edits a task of mine',
};

export const notificationKinds = Object.keys(notificationKindLabels) as NotificationKind[];

// Only same-site paths, so a notification can never send someone to another site.
export function safeNotificationLink(link: string | null) {
  return link && /^\/(?![/\\])/.test(link) ? link : '/notifications';
}
