import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EmployeePrivateForm } from '@/components/employees/EmployeePrivateForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { isEncryptionReady } from '@/server/security/fieldEncryption';
import { requirePagePermission } from '@/server/services/accessService';
import { getEmployee, getPrivateDetails } from '@/server/services/employeeService';

export const metadata: Metadata = { title: 'Edit ID and bank details' };

type EditPrivateDetailsPageProps = {
  params: Promise<{ employeeId: string }>;
};

// HR only. The person sees their own details masked on their record.
export default async function EditPrivateDetailsPage({ params }: EditPrivateDetailsPageProps) {
  await requirePagePermission(permissionKeys.employeesPrivateView);
  const employeeId = parseId((await params).employeeId);
  if (!employeeId) notFound();

  const employee = await getEmployee(employeeId);
  if (!employee) notFound();

  return (
    <>
      <PageHeader title={`ID and bank details: ${employee.full_name}`} description="Aadhaar and account numbers are encrypted before they are saved." />
      <Panel>
        <EmployeePrivateForm employeeId={employeeId} details={await getPrivateDetails(employeeId)} encryptionReady={isEncryptionReady()} />
      </Panel>
    </>
  );
}
