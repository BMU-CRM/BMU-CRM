import { FileText, Pencil, Printer } from 'lucide-react';
import { listLetterTemplates } from '@/server/services/recruitmentService';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmployeeAccountActions } from '@/components/employees/EmployeeAccountActions';
import { EmployeeDocumentsPanel } from '@/components/employees/EmployeeDocumentsPanel';
import { EmployeePersonalPanel } from '@/components/employees/EmployeePersonalPanel';
import { EmployeePrivatePanel } from '@/components/employees/EmployeePrivatePanel';
import { EmployeeProfileDetails } from '@/components/employees/EmployeeProfileDetails';
import { EmployeeRecordTabs, employeeRecordTabs, type EmployeeRecordTab } from '@/components/employees/EmployeeRecordTabs';
import { EmploymentHistoryPanel } from '@/components/employees/EmploymentHistoryPanel';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { isEncryptionReady } from '@/server/security/fieldEncryption';
import { requirePagePermission } from '@/server/services/accessService';
import {
  canViewEmployeeProfile,
  getEmployee,
  getEmployeeControls,
  getEmployeeRecordAccess,
  getEmploymentHistory,
  getPersonalDetails,
  getPrivateDetails,
  listDirectReports,
  listEmployeeDocuments,
  type EmployeeDetails,
} from '@/server/services/employeeService';
import styles from './EmployeeProfilePage.module.css';

export const metadata: Metadata = { title: 'Employee' };

type EmployeeProfilePageProps = {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function EmployeeProfilePage({ params, searchParams }: EmployeeProfilePageProps) {
  const access = await requirePagePermission(permissionKeys.employeesView);
  const employeeId = parseId((await params).employeeId);
  if (!employeeId) notFound();

  // Profiles outside the person's reach look the same as ones that do not exist.
  const [employee, canView] = await Promise.all([getEmployee(employeeId), canViewEmployeeProfile(access, employeeId)]);
  if (!employee || !canView) notFound();

  const recordAccess = await getEmployeeRecordAccess(access, employee.id);
  const tabs = employeeRecordTabs.filter(
    (tab) =>
      tab === 'overview' ||
      ((tab === 'personal' || tab === 'history') && recordAccess.canSeePersonal) ||
      (tab === 'private' && recordAccess.canSeePrivate) ||
      (tab === 'documents' && recordAccess.canSeeDocuments),
  );
  const requested = (await searchParams).tab as EmployeeRecordTab | undefined;
  const tab = requested && tabs.includes(requested) ? requested : 'overview';

  const controls = await getEmployeeControls(access, employee);

  return (
    <>
      <PageHeader
        title={employee.full_name}
        actions={
          <>
            <EmployeeAccountActions
              employeeId={employee.id}
              employeeName={employee.full_name}
              isActive={employee.is_active}
              canChangeAccount={controls.canChangeAccount}
              signInLinkKind={
                controls.canCreateSignInLink ? (employee.invite_accepted_at === null ? 'invite' : 'recovery') : null
              }
            />
            <ButtonLink href={`/people/employees/${employee.id}/print`} variant="ghost">
              <Printer size={16} aria-hidden="true" />
              Print
            </ButtonLink>
            {controls.canEdit && (
              <ButtonLink href={`/people/employees/${employee.id}/edit`}>
                <Pencil size={16} aria-hidden="true" />
                Edit
              </ButtonLink>
            )}
          </>
        }
      />
      {tabs.length > 1 && <EmployeeRecordTabs employeeId={employee.id} tabs={tabs} current={tab} />}
      {tab === 'overview' && <OverviewTab employee={employee} />}
      {tab === 'overview' &&
        (access.permissions[permissionKeys.recruitmentManage] !== undefined || access.permissions[permissionKeys.exitsManage] !== undefined) && (
          <EmployeeLetters employeeId={employee.id} />
        )}
      {tab === 'personal' && (
        <EmployeePersonalPanel employeeId={employee.id} details={await getPersonalDetails(employee.id)} canEdit={recordAccess.canEditPersonal} />
      )}
      {tab === 'private' && (
        <EmployeePrivatePanel
          employeeId={employee.id}
          details={await getPrivateDetails(employee.id)}
          canEdit={recordAccess.canEditPrivate}
          encryptionReady={isEncryptionReady()}
        />
      )}
      {tab === 'documents' && (
        <EmployeeDocumentsPanel
          employeeId={employee.id}
          documents={await listEmployeeDocuments(employee.id)}
          canAdd={recordAccess.canAddDocuments}
          viewerId={access.employee.id}
        />
      )}
      {tab === 'history' && <EmploymentHistoryPanel entries={await getEmploymentHistory(employee.id)} />}
    </>
  );
}

// Letters HR prints for someone still here, such as an internship completion letter.
async function EmployeeLetters({ employeeId }: { employeeId: string }) {
  const templates = (await listLetterTemplates()).filter((template) => template.is_active && template.kind !== 'offer');
  if (templates.length === 0) return null;
  return (
    <div className={styles.letters}>
      <Panel title="Letters">
        <ul className={styles.letterList}>
          {templates.map((template) => (
            <li key={template.id}>
              <Link href={`/letters/${template.id}/print?employee=${employeeId}`} className={styles.letterLink}>
                <FileText size={16} aria-hidden="true" /> {template.name}
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

async function OverviewTab({ employee }: { employee: EmployeeDetails }) {
  const reports = await listDirectReports(employee.id);
  return (
    <div className={styles.layout}>
      <EmployeeProfileDetails employee={employee} today={todayInIndia()} />
      <Panel title="Direct reports" description={`${reports.length} active`} flush>
        {reports.length === 0 ? (
          <p className={styles.empty}>No one reports to this employee.</p>
        ) : (
          <ul>
            {reports.map((report) => (
              <li key={report.id}>
                <Link href={`/people/employees/${report.id}`} className={styles.report}>
                  <PersonAvatar name={report.full_name} size="small" />
                  <div>
                    <p className={styles.reportName}>{report.full_name}</p>
                    <p className={styles.muted}>{report.designation?.title ?? 'No designation'}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
