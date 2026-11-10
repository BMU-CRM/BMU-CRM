import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { founderExists } from '@/server/auth/founderSetup';
import { getAppDatabase } from '@/server/database/appDatabase';

export const metadata: Metadata = { title: 'Sign in' };

type LoginPageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  // A fresh install has nobody to sign in yet, so it starts with setup.
  if (!(await founderExists(await getAppDatabase()))) redirect('/setup');

  const { next, error } = await searchParams;
  const notice = error === 'link-expired' ? 'This link has expired or was already used.' : undefined;

  return <LoginForm next={next} notice={notice} />;
}
