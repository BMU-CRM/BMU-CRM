import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EmployeeProfilePrint } from '@/components/employees/EmployeeProfilePrint';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import {
  canViewEmployeeProfile,
  getEmployee,
  getEmployeeRecordAccess,
  getPersonalDetails,
  getPrivateDetails,
} from '@/server/services/employeeService';

export const metadata: Metadata = { title: 'Print employee profile' };

type PrintEmployeePageProps = {
  params: Promise<{ employeeId: string }>;
};

export default async function PrintEmployeePage({ params }: PrintEmployeePageProps) {
  const access = await requirePagePermission(permissionKeys.employeesView);
  const employeeId = parseId((await params).employeeId);
  if (!employeeId) notFound();

  const [employee, canView] = await Promise.all([getEmployee(employeeId), canViewEmployeeProfile(access, employeeId)]);
  if (!employee || !canView) notFound();

  const recordAccess = await getEmployeeRecordAccess(access, employeeId);
  const [personal, privateDetails] = await Promise.all([
    recordAccess.canSeePersonal ? getPersonalDetails(employeeId) : Promise.resolve(undefined),
    recordAccess.canSeePrivate ? getPrivateDetails(employeeId) : Promise.resolve(undefined),
  ]);

  return <EmployeeProfilePrint employee={employee} personal={personal} privateDetails={privateDetails} printedOn={todayInIndia()} />;
}
