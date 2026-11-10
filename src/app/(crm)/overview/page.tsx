import type { Metadata } from 'next';
import { DashboardGrid } from '@/components/dashboard/DashboardGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';

export const metadata: Metadata = { title: 'Overview' };

export default async function OverviewPage() {
  const access = await requirePagePermission(permissionKeys.dashboardView);
  const firstName = access.employee.full_name.split(' ')[0];

  return (
    <>
      <PageHeader title={`Welcome back, ${firstName}`} description={access.employee.role?.name} />
      <DashboardGrid access={access} />
    </>
  );
}
