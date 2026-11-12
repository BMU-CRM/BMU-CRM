import type { Metadata } from 'next';
import { SalaryComponentForm } from '@/components/payroll/PayrollForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';

export const metadata: Metadata = { title: 'Add salary component' };

export default async function NewSalaryComponentPage() {
  await requirePagePermission(permissionKeys.payrollManage);
  return (
    <>
      <PageHeader title="Add salary component" description="Applied to everyone on payroll from the next run that is worked out." />
      <Panel>
        <SalaryComponentForm />
      </Panel>
    </>
  );
}
