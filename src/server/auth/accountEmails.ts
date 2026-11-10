// Invitation and password reset messages. Each one is queued in auth.outgoing_emails
// for an email provider to send once one is connected. Until then, administrators
// pass the link on themselves, so every function also returns it.
import type { PGlite } from '@electric-sql/pglite';
import { createOneTimeLink, queueEmail } from './authAccounts';

// Off until an email provider is connected. Pages use it to tell people where their
// link will come from.
export const emailIsConnected = false;

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export async function sendInvitation(db: PGlite, account: { userId: string; email: string; name: string }) {
  const token = await createOneTimeLink(db, account.userId, 'invite');
  const link = `${siteUrl()}/auth/confirm?type=invite&token=${token}`;
  await queueEmail(db, {
    to: account.email,
    kind: 'invite',
    subject: 'You have been invited to the workspace',
    body: `Hello ${account.name},\n\nYou have been invited to the company workspace. Open this link to choose your password. It works once and expires in 7 days.\n\n${link}`,
    link,
  });
  return link;
}

export async function sendPasswordReset(db: PGlite, account: { userId: string; email: string }) {
  const token = await createOneTimeLink(db, account.userId, 'recovery');
  const link = `${siteUrl()}/auth/confirm?type=recovery&token=${token}`;
  await queueEmail(db, {
    to: account.email,
    kind: 'recovery',
    subject: 'Reset your password',
    body: `Open this link to choose a new password. It works once and expires in 1 hour.\n\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
    link,
  });
  return link;
}
