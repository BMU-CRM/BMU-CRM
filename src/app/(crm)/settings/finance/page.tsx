import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FinanceSettingsForm } from '@/components/finance/FinanceSettingsForm';
import { FinanceSettingsTabs } from '@/components/finance/FinanceSettingsTabs';
import { PageHeader } from '@/components/ui/PageHeader';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { getFinanceSettings } from '@/server/services/financeService';

export const metadata: Metadata = { title: 'Finance settings' };

export default async function FinanceSettingsPage() {
  const access = await requirePagePermission(permissionKeys.financeManage);
  const settings = await getFinanceSettings();
  if (!settings) notFound();

  return (
    <>
      <PageHeader title="Finance settings" description="Your company's billing details, invoice numbering and the defaults for new documents." />
      <FinanceSettingsTabs current="general" permissions={access.permissions} />
      <FinanceSettingsForm settings={settings} />
    </>
  );
}
