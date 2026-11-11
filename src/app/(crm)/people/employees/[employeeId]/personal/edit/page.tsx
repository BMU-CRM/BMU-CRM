import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EmployeePersonalForm } from '@/components/employees/EmployeePersonalForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { parseId } from '@/lib/parseListParams';
import { requireAccess } from '@/server/services/accessService';
import { getEmployee, getEmployeeRecordAccess, getPersonalDetails } from '@/server/services/employeeService';

export const metadata: Metadata = { title: 'Edit personal details' };

type EditPersonalDetailsPageProps = {
  params: Promise<{ employeeId: string }>;
};

// People edit their own contact details here, and HR or a manager edits everything.
export default async function EditPersonalDetailsPage({ params }: EditPersonalDetailsPageProps) {
  const access = await requireAccess();
  const employeeId = parseId((await params).employeeId);
  if (!employeeId) notFound();

  const [employee, recordAccess] = await Promise.all([getEmployee(employeeId), getEmployeeRecordAccess(access, employeeId)]);
  if (!employee || !recordAccess.canEditPersonal) notFound();

  const details = await getPersonalDetails(employeeId);
  const isSelf = employeeId === access.employee.id;

  return (
    <>
      <PageHeader title={isSelf ? 'Your personal details' : `Personal details: ${employee.full_name}`} />
      <Panel>
        <EmployeePersonalForm
          employeeId={employeeId}
          details={details}
          canEditFully={recordAccess.canEditPersonalFully}
          cancelHref={isSelf ? '/profile' : `/people/employees/${employeeId}?tab=personal`}
        />
      </Panel>
    </>
  );
}
