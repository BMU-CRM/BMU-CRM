import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ConversionForm } from '@/components/recruitment/RecruitmentForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listManagerOptions } from '@/server/services/employeeService';
import { listAssignableRoles } from '@/server/services/organisationService';
import { getCandidate, getRecruitmentOptions } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Convert to employee' };

export default async function ConvertCandidatePage({ params }: { params: Promise<{ candidateId: string }> }) {
  const access = await requirePagePermission(permissionKeys.recruitmentManage);
  if (access.permissions[permissionKeys.employeesCreate] === undefined) notFound();
  const candidateId = parseId((await params).candidateId);
  if (!candidateId) notFound();

  const [candidate, options, managers] = await Promise.all([
    getCandidate(candidateId),
    getRecruitmentOptions(),
    listManagerOptions(access, permissionKeys.employeesCreate),
  ]);
  if (!candidate || candidate.employee_id) notFound();
  const roles = access.permissions[permissionKeys.employeesAssignRole] !== undefined ? await listAssignableRoles() : null;

  return (
    <>
      <PageHeader title={`Convert ${candidate.full_name} to an employee`} />
      <Panel>
        <ConversionForm
          candidateId={candidate.id}
          defaults={{
            fullName: candidate.full_name,
            workEmail: '',
            phone: candidate.phone ?? '',
            departmentId: candidate.department_id ?? '',
            designationId: candidate.offered_designation_id ?? '',
            joiningDate: candidate.offered_joining_date ?? todayInIndia(),
          }}
          options={options}
          roles={roles?.map((role) => ({ value: role.id, label: role.name })) ?? null}
          managers={managers.map((manager) => ({ value: manager.id, label: manager.full_name }))}
        />
      </Panel>
    </>
  );
}
