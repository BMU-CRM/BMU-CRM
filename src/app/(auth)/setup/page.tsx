import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { FirstAccountForm } from '@/components/auth/FirstAccountForm';
import { founderExists } from '@/server/auth/founderSetup';
import { getAppDatabase } from '@/server/database/localDatabase';

export const metadata: Metadata = { title: 'Set up' };

// Only reachable on a fresh install. Once the Founder account exists, it is closed.
export default async function SetupPage() {
  if (await founderExists(await getAppDatabase())) redirect('/login');
  return <FirstAccountForm />;
}
