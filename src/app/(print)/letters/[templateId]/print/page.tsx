import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LetterPrint } from '@/components/recruitment/LetterPrint';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { renderLetter, type LetterValues } from '@/lib/letters/renderLetter';
import { parseId } from '@/lib/parseListParams';
import { requireAccess } from '@/server/services/accessService';
import { getEmployee } from '@/server/services/employeeService';
import { getLeavingResignation } from '@/server/services/exitService';
import { getCompanyProfile } from '@/server/services/payrollService';
import { getCandidate, getLetterTemplate } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Letter' };

type LetterPageProps = {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ candidate?: string; employee?: string }>;
};

// A letter from a template, for a candidate (offer) or an employee (experience,
// internship, relieving). Templates are readable only by recruiters and HR, so anyone
// else gets "not found".
export default async function LetterPage({ params, searchParams }: LetterPageProps) {
  await requireAccess();
  const templateId = parseId((await params).templateId);
  const query = await searchParams;
  const candidateId = parseId(query.candidate);
  const employeeId = parseId(query.employee);
  if (!templateId || (!candidateId && !employeeId)) notFound();

  const [template, company] = await Promise.all([getLetterTemplate(templateId), getCompanyProfile()]);
  if (!template) notFound();
  const today = formatDate(todayInIndia());
  let values: LetterValues;
  let to: string | null;
  let backHref: string;

  if (candidateId) {
    const candidate = await getCandidate(candidateId);
    if (!candidate) notFound();
    values = {
      name: candidate.full_name,
      designation: candidate.offered_designation?.title ?? candidate.position,
      department: candidate.department?.name,
      salary: candidate.offered_salary !== null ? `${formatRupees(candidate.offered_salary)} a year` : null,
      joining_date: candidate.offered_joining_date ? formatDate(candidate.offered_joining_date) : null,
    };
    to = [candidate.full_name, candidate.email].filter(Boolean).join(', ');
    backHref = `/hr/recruitment/candidates/${candidate.id}`;
  } else {
    const [employee, leaving] = await Promise.all([getEmployee(employeeId!), getLeavingResignation(employeeId!)]);
    if (!employee) notFound();
    const lastDay = leaving?.last_working_day ?? null;
    values = {
      name: employee.full_name,
      employee_code: employee.employee_code,
      designation: employee.designation?.title,
      department: employee.department?.name,
      start_date: employee.joining_date ? formatDate(employee.joining_date) : null,
      end_date: lastDay ? formatDate(lastDay) : today,
      last_working_day: lastDay ? formatDate(lastDay) : null,
      joining_date: employee.joining_date ? formatDate(employee.joining_date) : null,
    };
    to = employee.full_name;
    backHref = leaving ? `/hr/exits/${leaving.id}` : `/people/employees/${employee.id}`;
  }

  values = { ...values, company: company?.legal_name ?? null, today };

  return (
    <LetterPrint
      company={company}
      date={today}
      to={to}
      subject={renderLetter(template.subject, values)}
      body={renderLetter(template.body, values)}
      backHref={backHref}
    />
  );
}
