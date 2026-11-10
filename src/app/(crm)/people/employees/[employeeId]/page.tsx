import { Pencil } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmployeeAccountActions } from '@/components/employees/EmployeeAccountActions';
import { EmployeeProfileDetails } from '@/components/employees/EmployeeProfileDetails';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import {
  canViewEmployeeProfile,
  getEmployee,
  getEmployeeControls,
  listDirectReports,
} from '@/server/services/employeeService';
import styles from './EmployeeProfilePage.module.css';

export const metadata: Metadata = { title: 'Employee' };

type EmployeeProfilePageProps = {
  params: Promise<{ employeeId: string }>;
};

export default async function EmployeeProfilePage({ params }: EmployeeProfilePageProps) {
  const access = await requirePagePermission(permissionKeys.employeesView);
  const employeeId = parseId((await params).employeeId);
  if (!employeeId) notFound();

  // Profiles outside the person's reach look the same as ones that do not exist.
  const [employee, canView] = await Promise.all([getEmployee(employeeId), canViewEmployeeProfile(access, employeeId)]);
  if (!employee || !canView) notFound();

  const [controls, reports] = await Promise.all([
    getEmployeeControls(access, employee),
    listDirectReports(employee.id),
  ]);

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
            {controls.canEdit && (
              <ButtonLink href={`/people/employees/${employee.id}/edit`}>
                <Pencil size={16} aria-hidden="true" />
                Edit
              </ButtonLink>
            )}
          </>
        }
      />
      <div className={styles.layout}>
        <EmployeeProfileDetails employee={employee} />
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
    </>
  );
}
