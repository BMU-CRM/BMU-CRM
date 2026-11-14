import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { getSessionUser } from '@/server/auth/currentSession';

export const metadata: Metadata = { title: 'Reset password' };

export default async function ForgotPasswordPage() {
  // Already signed in: straight to the app. (The route guard skips signed-in visits.)
  const user = await getSessionUser();
  if (user && !user.blocked) redirect('/overview');
  return <ForgotPasswordForm />;
}
