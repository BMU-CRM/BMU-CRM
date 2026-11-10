import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EmployeeProfileDetails } from '@/components/employees/EmployeeProfileDetails';
import { MyProfileForm } from '@/components/employees/MyProfileForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { requireAccess } from '@/server/services/accessService';
import { getEmployee } from '@/server/services/employeeService';
import styles from './MyProfilePage.module.css';

export const metadata: Metadata = { title: 'My profile' };

export default async function MyProfilePage() {
  const access = await requireAccess();
  const employee = await getEmployee(access.employee.id);
  if (!employee) notFound();

  return (
    <>
      <PageHeader title="My profile" />
      <div className={styles.stack}>
        <EmployeeProfileDetails employee={employee} />
        <Panel title="Update your details" description="Your manager or an administrator updates everything else.">
          <MyProfileForm phone={employee.phone} skills={employee.skills} />
        </Panel>
      </div>
    </>
  );
}
