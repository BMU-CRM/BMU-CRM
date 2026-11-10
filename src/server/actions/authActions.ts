'use server';

import { redirect } from 'next/navigation';
import { failure, success, validationFailure, type ActionResult } from '@/lib/actionResult';
import { firstAccountSchema, forgotPasswordSchema, loginSchema, setPasswordSchema } from '@/lib/validation/authSchema';
import { emailIsConnected, sendPasswordReset } from '@/server/auth/accountEmails';
import { checkPassword, findAuthUserByEmail, setAuthUserPassword } from '@/server/auth/authAccounts';
import { finishSession, getSessionUser, startSession } from '@/server/auth/currentSession';
import { createFounder, founderExists } from '@/server/auth/founderSetup';
import { isRateLimited } from '@/server/auth/signInRateLimit';
import { createAdminDatabaseClient } from '@/server/database/databaseClient';
import { getAppDatabase } from '@/server/database/localDatabase';

// Only same-site paths are allowed, so a crafted link cannot send users elsewhere.
function safeNextPath(value: FormDataEntryValue | null) {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/overview';
}

export async function signInAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  if (isRateLimited(parsed.data.email)) {
    return failure('Too many attempts. Please wait a few minutes and try again.');
  }

  const result = await checkPassword(await getAppDatabase(), parsed.data.email, parsed.data.password);
  if (result.status === 'invalid') return failure('The email or password is incorrect.');
  if (result.status === 'blocked') return failure('Your account is not active. Please contact your administrator.');

  await startSession(result.userId);
  redirect(safeNextPath(formData.get('next')));
}

export async function signOutAction() {
  await finishSession();
  redirect('/login');
}

export async function requestPasswordResetAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return validationFailure(parsed.error);

  if (!isRateLimited(`reset:${parsed.data.email}`)) {
    const db = await getAppDatabase();
    const user = await findAuthUserByEmail(db, parsed.data.email);
    if (user && !user.banned) await sendPasswordReset(db, { userId: user.id, email: parsed.data.email });
  }

  // The same reply either way, so this form cannot reveal who has an account.
  return success(
    emailIsConnected
      ? 'If that email has an account, a reset link is on its way.'
      : 'Email is not connected yet, so reset links cannot be emailed. Please ask your administrator to create a password reset link for you.',
  );
}

// Only works while no Founder account exists, which is the case on a fresh install.
export async function createFirstAccountAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = firstAccountSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const db = await getAppDatabase();
  if (await founderExists(db)) return failure('The workspace is already set up. Please sign in.');

  try {
    const { userId } = await createFounder(db, {
      name: parsed.data.fullName,
      email: parsed.data.email,
      password: parsed.data.password,
    });
    await startSession(userId);
  } catch (error) {
    console.error('Could not create the first account', error);
    return failure(error instanceof Error ? error.message : 'The account could not be created.');
  }

  redirect('/overview');
}

export async function setPasswordAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = setPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const user = await getSessionUser();
  if (!user || user.blocked) return failure('This link has expired. Please request a new one.');

  await setAuthUserPassword(await getAppDatabase(), user.userId, parsed.data.password);

  const admin = createAdminDatabaseClient();
  const { error: inviteError } = await admin
    .from('employees')
    .update({ invite_accepted_at: new Date().toISOString() })
    .eq('auth_user_id', user.userId)
    .is('invite_accepted_at', null);

  if (inviteError) console.error('Could not record accepted invitation', inviteError);

  redirect('/overview');
}
