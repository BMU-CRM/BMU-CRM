import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SalaryComponentForm } from '@/components/payroll/PayrollForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getSalaryComponent } from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'Edit salary component' };

export default async function EditSalaryComponentPage({ params }: { params: Promise<{ componentId: string }> }) {
  await requirePagePermission(permissionKeys.payrollManage);
  const componentId = parseId((await params).componentId);
  if (!componentId) notFound();
  const component = await getSalaryComponent(componentId);
  if (!component) notFound();
  return (
    <>
      <PageHeader title={`Edit ${component.name}`} />
      <Panel>
        <SalaryComponentForm component={component} />
      </Panel>
    </>
  );
}
