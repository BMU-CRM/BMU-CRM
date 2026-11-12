import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { InterviewForm } from '@/components/recruitment/RecruitmentForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { getCandidate } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Schedule interview' };

export default async function NewInterviewPage({ params }: { params: Promise<{ candidateId: string }> }) {
  await requirePagePermission(permissionKeys.recruitmentManage);
  const candidateId = parseId((await params).candidateId);
  if (!candidateId) notFound();
  const [candidate, employees] = await Promise.all([getCandidate(candidateId), listEmployeeOptions()]);
  if (!candidate) notFound();
  return (
    <>
      <PageHeader title={`Interview ${candidate.full_name}`} />
      <Panel>
        <InterviewForm
          candidateId={candidate.id}
          interviewers={employees.map((employee) => ({ value: employee.id, label: employee.full_name }))}
          defaultDate={todayInIndia()}
        />
      </Panel>
    </>
  );
}
